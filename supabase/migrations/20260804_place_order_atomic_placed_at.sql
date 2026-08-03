-- 20260804_place_order_atomic_placed_at.sql
-- Fold `placed_at` into place_order_atomic's INSERT and retire the phase-1 post-insert UPDATE.
--
-- 🔴 CLASSIFICATION: **DEPLOY-COUPLED, AND IT FAILS SILENTLY IF SKIPPED.**
-- This is a FUNCTION BODY change, not a signature change — the same class as
-- 20260728_orders_total_minor_deal_savings.sql, whose header records the trap:
--   "Unlike the §65 PGRST202 incident it will NOT fail loudly if it is skipped: the 7-param signature
--    still resolves, the customer order still saves, and total_minor is simply left NULL on every
--    customer order — silently, with nothing in the logs."
-- Exactly the same here. If the app deploys and this does not run, customer orders still save and
-- `placed_at` is simply NULL on every one of them, forever, with no error anywhere — because the
-- compensating UPDATE that used to set it is deleted in the same deploy.
--
--   ✅ RUN THIS **BEFORE** DEPLOYING. Applying it early is harmless: the old build's post-insert
--      UPDATE just overwrites the value the RPC set, with a value ~1ms later. Same answer, one extra
--      write, no behaviour change.
--
-- VERIFY AFTER APPLYING:
--   select pg_get_functiondef(oid) like '%placed_at%' from pg_proc where proname = 'place_order_atomic';
--   -- expect: t
-- AND AFTER DEPLOYING, place one customer order and confirm:
--   select id, placed_at, created_at from orders order by created_at desc limit 1;
--   -- expect placed_at NON-NULL and >= created_at (server-minted INSIDE the insert; contrast the
--   --        OPERATOR path, where placed_at is client-minted and lands a beat BEFORE created_at).
--
-- ── WHY THE VALUE IS now(), NOT SOMETHING THE CALLER SENDS ──────────────────────────────────────────
-- The customer path stays SERVER-MINTED, deliberately and unchanged. `placed_at` exists because an
-- OFFLINE OPERATOR order is inserted long after it was sold and only the taking device knows when. A
-- customer order is placed online, synchronously, inside this very transaction — request time IS commit
-- time — so reading our own clock is strictly better than trusting a customer's phone. The operator
-- path is the only one that client-mints, and it does not come through this function.
--
-- ⚠️ now() is TRANSACTION-START time in Postgres, so placed_at and created_at (column default now())
-- are the SAME instant on this path. That is correct and is the point: on the customer path there is no
-- gap between "taken" and "recorded" to represent.
--
-- ── WHAT ELSE CHANGED: NOTHING ─────────────────────────────────────────────────────────────────────
-- Byte-identical to 20260728 except for the two added lines (the placed_at column in the insert list
-- and its value). Signature, order-number logic, production_slot_usage DELETE-then-INSERT, RETURNING
-- and the return jsonb are all unchanged.
--
-- BEFORE APPLYING: dump the LIVE body and confirm it matches 20260728 (no hand-run drift):
--   select pg_get_functiondef(oid) from pg_proc where proname = 'place_order_atomic';
-- If the live body differs, apply this SAME single addition to the LIVE body instead.

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
    total, total_minor, notes, status, payment_status, placed_at
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
    round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer,
    p_order->>'notes',
    p_status,
    coalesce(p_order->>'payment_status', 'unpaid'),
    -- SERVER-MINTED. Never read from p_order: the TS caller does not send it on this path and must not
    -- start to. See the header for why the customer path is the one that does NOT client-mint.
    now()
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

notify pgrst, 'reload schema';
