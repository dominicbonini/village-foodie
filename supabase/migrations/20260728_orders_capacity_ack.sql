-- 20260728_orders_capacity_ack.sql
-- ONE additive, nullable column on `orders`: did the operator knowingly accept an over-capacity
-- placement, and when.
--
-- 🔴 DEPLOY-COUPLED — RUN THIS BEFORE DEPLOYING THE APP. The operator manual-add path
-- (app/api/dashboard/action/route.ts) now names `capacity_ack_at` in its insert payload on EVERY
-- walk-up, not only acknowledged ones (it writes NULL otherwise). PostgREST rejects an insert naming
-- a column it cannot see (PGRST204), so deploying first would break walk-up creation outright until
-- this runs. The reverse order is safe: the column is nullable with no default, so applying it ahead
-- of the deploy changes nothing for the current code.
--
-- ✅ NO FUNCTION CHANGE. place_order_atomic is NOT touched by this migration and needs no edit: the
-- customer submit path cannot produce an acknowledged over-capacity order (there is no operator to
-- acknowledge, and that path is hard-gated by earliestBackwardFitSlot). The operator manual insert is
-- a DIRECT `supabase.from('orders').insert(...)` / `.upsert(...)`, not an RPC — verified at
-- app/api/dashboard/action/route.ts (the insertPayload block), so the column is reachable without
-- re-declaring any function body. This deliberately avoids the silent-skip failure mode of a
-- CREATE OR REPLACE FUNCTION migration.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_name='orders' and column_name='capacity_ack_at';

alter table orders
  add column if not exists capacity_ack_at timestamptz;

comment on column orders.capacity_ack_at is
  'When an operator was shown the over-capacity modal and chose "Place it anyway". Server-minted timestamp; the client sends intent only. NULL = no acknowledgement (a normal placement, or a breach that arose unattended - offline collision / sync race). Written by the operator manual-add path only.';

-- PostgREST must reload so the new column is visible to the API (else the manual-add insert gets
-- PGRST204 "could not find the 'capacity_ack_at' column of 'orders' in the schema cache"):
notify pgrst, 'reload schema';

-- NOT DONE HERE, deliberately: no backfill, and no reader. Existing rows stay NULL, which is the
-- correct value for them - none of them carried an acknowledgement. Narrowing CapacityBreachBanner to
-- unacknowledged breaches is a separate, later task and is explicitly out of scope for this change.
