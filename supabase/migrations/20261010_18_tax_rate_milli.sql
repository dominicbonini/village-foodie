-- 20261010_18_tax_rate_milli.sql
-- Phase 3 screens: SALES TAX RATES IN THOUSANDTHS OF A PERCENT (docs/phase-3-screens-report.md).
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN NOW — AFTER 20261010_17 AND BEFORE THIS CODE IS TESTED OR DEPLOYED. The new
--    code reads and writes `tax_rate_milli` by name and calls the replaced place_order_atomic_v2.
--    • Why: a basis point is 0.01 %, so `tax_rate_bps` cannot hold a 3-decimal rate such as 8.875 %
--      (887.5 bp). Dominic chose Option B: thousandths of a percent, so 8.875 % = 8875 and 8.25 % = 8250.
--    • Three new NULLABLE integer columns, each CHECKed 0–20000 (0 % to 20 %). Nothing is backfilled:
--      no live truck has a rate yet, and no live order is taxed on top.
--    • The four `tax_rate_bps` columns (trucks, orders, order_drafts, truck_events) STAY. From this code on
--      nothing reads or writes them; a comment on each says so. Nothing is dropped.
--    • `place_order_atomic_v2` is replaced in place (same name, same signature) so it writes
--      `tax_rate_milli` instead of `tax_rate_bps`. `place_order_atomic` (20260804) is not touched.
--    • Safe to run twice: `add column if not exists`, each CHECK added only when missing,
--      `create or replace` for the function, and comments simply rewritten.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file.

set lock_timeout = '3s';

begin;

alter table public.trucks       add column if not exists tax_rate_milli integer;
alter table public.orders       add column if not exists tax_rate_milli integer;
alter table public.order_drafts add column if not exists tax_rate_milli integer;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('trucks',       'trucks_tax_rate_milli_chk'),
      ('orders',       'orders_tax_rate_milli_chk'),
      ('order_drafts', 'order_drafts_tax_rate_milli_chk')
    ) as v(tbl, name)
  loop
    if not exists (
      select 1 from pg_constraint k join pg_class r on r.oid = k.conrelid join pg_namespace n on n.oid = r.relnamespace
       where n.nspname = 'public' and r.relname = c.tbl and k.conname = c.name
    ) then
      execute format('alter table public.%I add constraint %I check (tax_rate_milli between 0 and 20000)', c.tbl, c.name);
    end if;
  end loop;
end $$;

comment on column public.trucks.tax_rate_milli is
  'The truck''s ONE sales tax rate, in thousandths of a percent (8.875% = 8875; 8.25% = 8250). NULL = none set. Ignored where the country''s prices include tax. Phase 3 screens.';
comment on column public.orders.tax_rate_milli is
  'The tax rate this order was priced at, thousandths of a percent (8.25% = 8250). NULL where prices include tax. Snapshot (D4). Phase 3 screens.';
comment on column public.order_drafts.tax_rate_milli is
  'The tax rate this draft was priced at, thousandths of a percent; copied to the order on promotion. Phase 3 screens.';

comment on column public.trucks.tax_rate_bps is
  'RETIRED 13 October 2026, never written: replaced by tax_rate_milli (thousandths of a percent). Nothing reads or writes it. Kept, not dropped.';
comment on column public.orders.tax_rate_bps is
  'RETIRED 13 October 2026, never written: replaced by tax_rate_milli. Nothing reads or writes it. Kept, not dropped.';
comment on column public.order_drafts.tax_rate_bps is
  'RETIRED 13 October 2026, never written: replaced by tax_rate_milli. Nothing reads or writes it. Kept, not dropped.';
comment on column public.truck_events.tax_rate_bps is
  'RETIRED 13 October 2026, never written: each truck has ONE sales tax rate (Dominic), so there is no per-event override. Nothing reads or writes it. Kept, not dropped.';

-- place_order_atomic_v2, replaced: identical to 20261010_17's except that it writes `tax_rate_milli` where
-- that one wrote `tax_rate_bps`.
create or replace function place_order_atomic_v2(
  p_order      jsonb,
  p_final_slot text,
  p_status     text,
  p_event_id   uuid,
  p_truck_id   text,
  p_event_date date,
  p_unit_rows  jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_order_number integer;
  v_order_key    uuid;
  v_row          jsonb;
begin
  -- DISPLAY NUMBER: event counter first, truck-level fallback when there is no event.
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
  if v_order_number is null then
    raise exception 'could not generate order number (truck %, event %)', p_truck_id, p_event_id;
  end if;

  -- INSERT the order (order_key + created_at/updated_at via column defaults; currency and country via
  -- orders_fill_currency_country).
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at,
    food_minor, tax_minor, tax_rate_milli, tax_inclusive, tax_label, tip_minor, tip_pct_bps,
    service_fee_minor, service_fee_recipient, card_surcharge_minor, card_funding, card_fee_payer,
    application_fee_minor
  ) values (
    v_order_number::text,
    p_truck_id,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_final_slot,
    coalesce(p_order->>'order_type', 'collection'),
    p_event_date,
    p_event_id,
    nullif(p_order->>'van_id', '')::uuid,
    coalesce(p_order->'items', '[]'::jsonb),
    p_order->'deals',
    p_order->>'discount_code',
    (p_order->>'subtotal')::numeric,
    coalesce((p_order->>'discount_amt')::numeric, 0),
    (p_order->>'total')::numeric,
    -- 🔴 THE GRAND TOTAL, AS THE CALLER COMPUTED IT IN MINOR UNITS (fallback: round(total × 100)).
    coalesce((p_order->>'total_minor')::integer, round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer),
    p_order->>'notes',
    p_status,
    coalesce(p_order->>'payment_status', 'unpaid'),
    -- SERVER-MINTED. Never read from p_order.
    now(),
    (p_order->>'food_minor')::integer,
    coalesce((p_order->>'tax_minor')::integer, 0),
    (p_order->>'tax_rate_milli')::integer,
    (p_order->>'tax_inclusive')::boolean,
    p_order->>'tax_label',
    coalesce((p_order->>'tip_minor')::integer, 0),
    (p_order->>'tip_pct_bps')::integer,
    coalesce((p_order->>'service_fee_minor')::integer, 0),
    p_order->>'service_fee_recipient',
    coalesce((p_order->>'card_surcharge_minor')::integer, 0),
    p_order->>'card_funding',
    p_order->>'card_fee_payer',
    (p_order->>'application_fee_minor')::integer
  )
  returning order_key into v_order_key;

  -- BOOK capacity, EVENT-SCOPED: only when there's an event AND TS-computed rows (booked).
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop
      insert into production_slot_usage (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
      values (p_truck_id, p_event_id, p_event_date, v_row->>'production_slot', v_row->'units_by_cat', now());
    end loop;
  end if;

  return jsonb_build_object(
    'order_key',    v_order_key,
    'order_number', v_order_number,
    'slot',         p_final_slot
  );
end;
$$;

-- Service role only, as 20261010_17 set it (create or replace keeps grants; restated so a second run is exact).
revoke all on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Three new columns, all nullable integer (expect 3 rows):
--   select table_name, column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and column_name = 'tax_rate_milli' order by 1;
--
-- 2. Three CHECKs (expect 3 rows):
--   select r.relname, k.conname, pg_get_constraintdef(k.oid) from pg_constraint k join pg_class r on r.oid = k.conrelid
--    where k.conname in ('trucks_tax_rate_milli_chk', 'orders_tax_rate_milli_chk', 'order_drafts_tax_rate_milli_chk') order by 1;
--
-- 3. v2 now writes tax_rate_milli and not tax_rate_bps (expect true, false), and is service-role only
--    (expect false, false, true):
--   select pg_get_functiondef('public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)'::regprocedure) like '%tax_rate_milli%' as writes_milli,
--          pg_get_functiondef('public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)'::regprocedure) like '%tax_rate_bps%'   as writes_bps;
--   select has_function_privilege('anon',          'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as authenticated,
--          has_function_privilege('service_role',  'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as service_role;
--
-- 4. The retired columns are commented (expect 4 rows, each starting "RETIRED"):
--   select c.relname, col_description(c.oid, a.attnum) from pg_class c join pg_attribute a on a.attrelid = c.oid
--    where c.relnamespace = 'public'::regnamespace and a.attname = 'tax_rate_bps'
--      and c.relname in ('trucks', 'orders', 'order_drafts', 'truck_events') order by 1;
