-- 20260728_orders_total_minor_deal_savings.sql
-- Two ADDITIVE columns on `orders`, plus the place_order_atomic body change that populates one of them.
--
-- 🔴 DEPLOY-COUPLED — RUN THIS BEFORE DEPLOYING THE APP. Both columns are written explicitly by the
-- operator manual-add path and the operator edit path (app/api/dashboard/action/route.ts). PostgREST
-- rejects an insert/update naming a column it cannot see (PGRST204), so deploying the app first would
-- break walk-up creation and order edits until this runs. The reverse order is safe: these columns are
-- nullable/defaulted, so applying this migration ahead of the deploy changes nothing for the old code.
--
-- ⚠️ place_order_atomic (below) is a FUNCTION BODY change, NOT a signature change. Unlike the §65
-- PGRST202 incident it will NOT fail loudly if it is skipped: the 7-param signature still resolves,
-- the customer order still saves, and total_minor is simply left NULL on every customer order —
-- silently, with nothing in the logs. The only way to know it ran is to check.
--
-- VERIFY AFTER APPLYING:
--   select column_name from information_schema.columns
--    where table_name='orders' and column_name in ('total_minor','deal_savings');
--   select pg_get_functiondef(oid) like '%total_minor%' from pg_proc where proname='place_order_atomic';

-- ── (a) orders.total_minor ────────────────────────────────────────────────────────────────────────
-- The authoritative charge amount in PENCE. Derived server-side as round(total * 100) at every write
-- path; NEVER client-supplied. Exact and lossless because `total` is numeric(8,2) — Postgres has
-- already rounded to pence at the insert boundary, so there is no fractional penny to lose. This is
-- the integer money column the payment ledger will settle against; `total` stays as-is for every
-- existing reader. Nullable: pre-existing rows are not backfilled here (a backfill would be a separate,
-- reviewable statement — see the note at the foot of this file).
alter table orders
  add column if not exists total_minor integer;

comment on column orders.total_minor is
  'Authoritative charge amount in pence = round(total*100). Server-derived at every write path, never client-supplied.';

-- ── (b) orders.deal_savings ───────────────────────────────────────────────────────────────────────
-- The NOTIONAL "saved versus buying the deal items a la carte" figure. It is NOT money deducted from
-- the total — the bundle price already reflects the saving. It previously travelled in the discountAmt
-- slot from the operator Add Order panel and was stored in orders.discount_amt, where every reader
-- treats it as money off (the edit path subtracted it from the total a second time; the confirmation
-- email printed it as a discount line). Giving it its own column is what makes discount_amt mean
-- money-deducted-from-total on EVERY path, with no exceptions.
alter table orders
  add column if not exists deal_savings numeric(8,2);

comment on column orders.deal_savings is
  'Notional saving vs a la carte for bundled deals. Display only - NEVER subtracted from total. Distinct from discount_amt (real money off).';

-- ── (c) place_order_atomic — add total_minor to the INSERT ────────────────────────────────────────
-- Byte-identical to 20260715_place_order_atomic_drop_drawlist.sql except for the two added lines
-- (the total_minor column in the insert list, and its round() value). Signature, order-number logic,
-- production_slot_usage DELETE-then-INSERT, RETURNING and return jsonb are unchanged.
--
-- total_minor is computed INSIDE the function from the total the caller passed — the TS never sends
-- it, so it cannot be client-supplied on this path either. deal_savings is deliberately NOT set here:
-- the customer path has no deals-savings concept to record (deals are priced, not discounted).
--
-- BEFORE APPLYING: dump the LIVE body and confirm it matches 20260715 (no hand-run drift):
--   select pg_get_functiondef(oid) from pg_proc where proname='place_order_atomic';
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
    total, total_minor, notes, status, payment_status
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

-- PostgREST must reload so the two new columns are visible to the API (else the operator paths get
-- PGRST204 "could not find the 'total_minor' column of 'orders' in the schema cache"):
notify pgrst, 'reload schema';

-- NOT DONE HERE, deliberately: backfilling total_minor for the existing rows
--   (update orders set total_minor = round(total*100) where total_minor is null and total is not null;)
-- is a single safe statement, but it rewrites every historical row and belongs in its own reviewable
-- step once the ledger actually reads the column. New writes populate it from this migration onward.
