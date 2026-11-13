-- supabase/migrations/20261100_app_tester_test_formules_order.sql — deals-order-1 (13 November 2026, docs/deals-order-1-report.md).
-- TEST DATA, THE TEST TRUCK ONLY (Dominic approved test formules on App Tester, 13 Nov). Run by Claude with scripts/db-migrate.cjs.
-- Puts App Tester's three test formules (20261099) in the order the drag check produced — "Pizza + Dessert" dragged to the top —
-- by writing exactly what Manage › Menu › Deals saves after that drag (update_bundle_order: sort_order 1, 2, 3 in the new order).
-- It is NOT the order they were created in, so the localhost check (scripts/deals-order-1-live.cjs --live) proves the order page
-- and the dashboard follow the truck's stored order. Manage cannot be opened here without App Tester's owner signed in, so this
-- file stands in for that one save. Only these three rows, only on test-truck-3-2.
begin;

update public.bundles_db b
   set sort_order = v.sort_order
  from (values
    ('d0000001-0000-4000-8000-00000000a003'::uuid, 1),   -- Pizza + Dessert
    ('d0000001-0000-4000-8000-00000000a001'::uuid, 2),   -- Pizza + Drink
    ('d0000001-0000-4000-8000-00000000a002'::uuid, 3)    -- Dough Balls + Drink
  ) as v(id, sort_order)
 where b.id = v.id
   and b.truck_id = 'test-truck-3-2';

commit;
