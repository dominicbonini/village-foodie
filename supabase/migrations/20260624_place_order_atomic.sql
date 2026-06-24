-- §45 durable fix (stage 2): atomic order placement — the "dumb writer" RPC.
--
-- Makes [option-stock draw + display-number + order INSERT + production_slot_usage book] ONE
-- transaction. A plpgsql function body IS one transaction: any RAISE rolls back EVERYTHING, so a
-- failure leaves NO ghost order, NO leaked option stock, and NO display-number gap.
--
-- CRITICAL: this function contains NO seating/capacity/category/batch logic. p_unit_rows arrives
-- FULLY COMPUTED from TS (lib/slot-bookings.ts computeEventUnitRows, reusing buildUnitsFromOrders /
-- normaliseOrderLines / orderItemsToQtyByCat / mergeQtyByCat — byte-identical to today). The RPC only
-- WRITES what it is given. The TS resolve (earliestBackwardFitSlot / placeOrderInSlotLocked), the
-- auto-accept + pre-order-force-pending status decision, and the option-id resolution all stay in TS.
--
-- Reuses the EXISTING atomic primitives (not reimplemented):
--   decrement_modifier_option_stock(uuid,int)->bool   (20260619)  — option pool draw
--   increment_event_order_counter(uuid)->int           (20260607)  — per-event display number
--   increment_order_counter(text)->int                 (20260607)  — truck-level fallback
-- Calling them inside this function shares the transaction, so a rollback un-does the draw AND the
-- counter increment automatically (no compensation, no gap).
--
-- USAGE WRITE IS EVENT-SCOPED (decision): clears + rewrites ONLY this order's event_id rows. Other
-- events on the same date are untouched (the old date-wide rebuildProductionSlotUsage self-heal is
-- intentionally NOT replicated here — the dashboard/backfill reconcile paths still cover that).
--
-- Apply by hand in the Supabase SQL editor, then:  notify pgrst, 'reload schema';

create or replace function place_order_atomic(
  p_order      jsonb,   -- order columns (customer_*, items, deals, totals, notes, order_type, payment_status, van_id)
  p_final_slot text,    -- resolved collection slot (TS resolve output); null = ASAP/unbooked-pending
  p_status     text,    -- 'pending' | 'confirmed' (TS auto-accept + force-pending decision)
  p_event_id   uuid,    -- resolved event (null for a no-event order)
  p_truck_id   text,
  p_event_date date,
  p_unit_rows  jsonb,   -- [{production_slot, units_by_cat}] from computeEventUnitRows; null/[] = do NOT touch usage (not booked / no event)
  p_draw_list  jsonb    -- [{id, qty}] tracked option draws resolved in TS; null/[] = none
) returns jsonb
language plpgsql
as $$
declare
  v_draw         jsonb;
  v_ok           boolean;
  v_order_number integer;
  v_order_key    uuid;
  v_row          jsonb;
begin
  -- 1. OPTION-STOCK DRAWS (atomic per option; reuse existing fn). Insufficiency → RAISE → rollback.
  if p_draw_list is not null then
    for v_draw in select * from jsonb_array_elements(p_draw_list) loop
      v_ok := decrement_modifier_option_stock((v_draw->>'id')::uuid, (v_draw->>'qty')::int);
      if not v_ok then
        raise exception 'option stock insufficient (option %)', v_draw->>'id'
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- 2. DISPLAY NUMBER (reuse existing fn; in-txn so a rollback un-increments — no gap). Event counter
  --    first, truck-level fallback when there is no event (matches nextOrderId in lib/order-utils.ts).
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
  if v_order_number is null then
    raise exception 'could not generate order number (truck %, event %)', p_truck_id, p_event_id;
  end if;

  -- 3. INSERT the order (order_key + created_at/updated_at via column defaults). slot = the resolved
  --    finalSlot, id = the display number, status = the TS decision — set explicitly, never from p_order.
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

  -- 4. BOOK capacity — EVENT-SCOPED. Only when there's an event AND TS computed rows (booked). A
  --    not-booked / no-event order skips this (p_unit_rows null) → order persists unbooked, exactly
  --    like today's full-but-pending path. Clear this event's rows, insert the precomputed ones.
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

-- PostgREST must reload to expose the new RPC:
--   notify pgrst, 'reload schema';
