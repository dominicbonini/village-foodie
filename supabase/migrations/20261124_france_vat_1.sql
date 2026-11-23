-- 20261124_france_vat_1.sql
-- france-vat-1 (24 November 2026, docs/france-vat-1-report.md): A VAT RATE PER ITEM, A PER-RATE BREAKDOWN ON EACH ORDER, AND
-- RATES UP TO 30 %.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (the live site uses this database):
--    • menu_items_db.tax_rate_milli — NEW, NULLABLE. NULL = "use the truck's default rate" (trucks.tax_rate_milli, else the
--      address format's default). Nothing is backfilled: every existing dish is NULL, so every existing truck is unchanged.
--    • orders.tax_breakdown / order_drafts.tax_breakdown — NEW, NULLABLE jsonb: one object per rate,
--      {rate_milli, food_minor, gross_minor, net_minor, tax_minor}. Old orders stay NULL and every reader handles NULL as today.
--    • The three existing tax_rate_milli CHECKs (trucks, orders, order_drafts) widen from 0–20000 to 0–30000 (0 % to 30 %), so
--      Ireland's 23 % and the 25–27 % countries fit. Widening accepts every row the old check accepted; the deployed code still
--      refuses anything above 20 % itself, so nothing it writes changes.
--    • place_order_atomic_v2 is replaced IN PLACE with the SAME NAME, SAME SIGNATURE and SAME GRANTS (the 20261010_18 pattern).
--      Its only change: it also writes tax_breakdown from p_order->'tax_breakdown'. NO NEW PARAMETER, so there is no overload
--      and no ambiguity. The deployed code never sends the key, so its orders store NULL there: exactly what it stores today.
--      ⚠️ nullif(…, 'null'::jsonb): a JSON null in p_order must store SQL NULL, never the jsonb literal null.
--    • Nothing is dropped except the three CHECK constraints, which are re-added wider in the same transaction. No rename.
--      No row is updated or deleted.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The new columns
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.menu_items_db add column if not exists tax_rate_milli integer;
alter table public.orders        add column if not exists tax_breakdown  jsonb;
alter table public.order_drafts  add column if not exists tax_breakdown  jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_db_tax_rate_milli_chk' and conrelid = 'public.menu_items_db'::regclass) then
    alter table public.menu_items_db add constraint menu_items_db_tax_rate_milli_chk check (tax_rate_milli between 0 and 30000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_tax_breakdown_array_chk' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_tax_breakdown_array_chk check (tax_breakdown is null or jsonb_typeof(tax_breakdown) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_drafts_tax_breakdown_array_chk' and conrelid = 'public.order_drafts'::regclass) then
    alter table public.order_drafts add constraint order_drafts_tax_breakdown_array_chk check (tax_breakdown is null or jsonb_typeof(tax_breakdown) = 'array');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The rate limit: 0–20000 → 0–30000 on the three existing columns (drop and re-add, same names)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.trucks       drop constraint if exists trucks_tax_rate_milli_chk;
alter table public.trucks       add  constraint trucks_tax_rate_milli_chk       check (tax_rate_milli between 0 and 30000);
alter table public.orders       drop constraint if exists orders_tax_rate_milli_chk;
alter table public.orders       add  constraint orders_tax_rate_milli_chk       check (tax_rate_milli between 0 and 30000);
alter table public.order_drafts drop constraint if exists order_drafts_tax_rate_milli_chk;
alter table public.order_drafts add  constraint order_drafts_tax_rate_milli_chk check (tax_rate_milli between 0 and 30000);

comment on column public.menu_items_db.tax_rate_milli is
  'france-vat-1: this dish''s own tax rate, thousandths of a percent (10 % = 10000; 0–30 %). NULL = the truck''s default (trucks.tax_rate_milli, else the address format''s). Its extras take the same rate.';
comment on column public.orders.tax_breakdown is
  'france-vat-1: the tax per rate, [{rate_milli, food_minor, gross_minor, net_minor, tax_minor}] ascending by rate, covering dishes, extras and deals after the discount. NULL on orders placed before france-vat-1 and on orders with no rate at all (every UK truck with no VAT set). Readers prefer it to tax_rate_milli when present.';
comment on column public.order_drafts.tax_breakdown is
  'france-vat-1: the same per-rate breakdown as orders.tax_breakdown; copied to the order on promotion.';
comment on column public.trucks.tax_rate_milli is
  'The truck''s default tax rate, in thousandths of a percent (8.875% = 8875; 0–30 %). NULL = none set (the address format''s default where it has one, else no tax). france-vat-1: also honoured where prices include tax and the format has no default (GB, IE …), where NULL means "No VAT".';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. place_order_atomic_v2, replaced: identical to the live definition (20261010_18, read with pg_get_functiondef on
--    24 November 2026) except that it also writes `tax_breakdown`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
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
    application_fee_minor, tax_breakdown
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
    (p_order->>'application_fee_minor')::integer,
    -- france-vat-1: absent (every deployed caller) → SQL NULL; a JSON null → SQL NULL too.
    nullif(p_order->'tax_breakdown', 'null'::jsonb)
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

-- Service role only, exactly as 20261010_17 / _18 set it (create or replace keeps grants; restated so a second run is exact).
revoke all on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The three new columns (expect 3 rows, all nullable, no default):
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and ((table_name = 'menu_items_db' and column_name = 'tax_rate_milli')
--       or (table_name in ('orders', 'order_drafts') and column_name = 'tax_breakdown')) order by 1, 2;
-- 2. The six CHECKs (expect 6 rows; the three rate checks say 30000):
--   select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('menu_items_db_tax_rate_milli_chk', 'orders_tax_breakdown_array_chk', 'order_drafts_tax_breakdown_array_chk',
--                      'trucks_tax_rate_milli_chk', 'orders_tax_rate_milli_chk', 'order_drafts_tax_rate_milli_chk') order by 2;
-- 3. ONE place_order_atomic_v2, the same signature, service role only (expect 1 row: false, false, true):
--   select pg_get_function_identity_arguments(oid), has_function_privilege('anon', oid, 'execute'),
--          has_function_privilege('authenticated', oid, 'execute'), has_function_privilege('service_role', oid, 'execute')
--     from pg_proc where proname = 'place_order_atomic_v2' and pronamespace = 'public'::regnamespace;
-- 4. Nothing switched on (expect 0, 0):
--   select (select count(*) from public.menu_items_db where tax_rate_milli is not null),
--          (select count(*) from public.orders where tax_breakdown is not null);
