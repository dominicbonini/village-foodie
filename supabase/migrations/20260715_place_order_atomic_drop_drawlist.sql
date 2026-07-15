-- S65 (V8.0) FOLLOW-UP: the place_order_atomic rewrite that was never committed/applied to prod.
--
-- The TS (app/api/orders/submit/route.ts) calls place_order_atomic with the 7-param signature (NO
-- p_draw_list) since the S65 extras-stock CEILING conversion removed the in-RPC option draw. Production
-- (ffphgwonshgxamtvefcv) still had ONLY the OLD 8-param version -> PostgREST PGRST202 "Could not find
-- the function ... (..., p_unit_rows)" -> customer order placement 500'd ("Failed to save order").
-- Operator orders were unaffected (dashboard/action does a DIRECT orders insert, not this RPC).
--
-- This body is the committed 20260624 original MINUS exactly two things (a self-contained deletion per
-- S65, NOT a rewrite): (a) the p_draw_list param, (b) the option-stock draw loop (+ the v_draw/v_ok
-- declares it used). Order-number logic, the INSERT column list/values, the production_slot_usage
-- DELETE-then-INSERT, the RETURNING, and the return jsonb are BYTE-IDENTICAL.
--
-- NOTE: inline comments were removed from the CREATE signature (they tripped the Supabase SQL editor
-- parser). Whole file is ASCII to avoid paste/encoding issues.
-- BEFORE APPLYING: dump the LIVE 8-param body and confirm it matches 20260624 (no other hand-run drift):
--   select pg_get_functiondef(oid) from pg_proc where proname='place_order_atomic';
-- If the live body differs, apply these SAME two removals to the LIVE body instead.

create or replace function place_order_atomic(
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

  -- INSERT the order (order_key + created_at/updated_at via column defaults).
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, notes, status, payment_status
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
    p_order->>'notes',
    p_status,
    coalesce(p_order->>'payment_status', 'unpaid')
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

-- Drop the OLD 8-param overload (dead; it references the helpers dropped below). Different signature
-- from the new 7-param fn, so this DROP cannot hit the new one.
drop function if exists place_order_atomic(jsonb, text, text, uuid, text, date, jsonb, jsonb);

-- Drop the orphaned S65 option-stock helpers (ceiling model replaced the decrement pool).
drop function if exists decrement_modifier_option_stock(uuid, int);
drop function if exists increment_modifier_option_stock(uuid, int);

-- PostgREST must reload to expose the new signature (else it keeps returning PGRST202):
notify pgrst, 'reload schema';
