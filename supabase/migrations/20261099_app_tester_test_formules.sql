-- supabase/migrations/20261099_app_tester_test_formules.sql — deals-order-1 (13 November 2026, docs/deals-order-1-report.md).
-- TEST DATA, THE TEST TRUCK ONLY. Dominic, 13 Nov: "add 3 test formules to the App Tester truck (test truck only — I approve this
-- test data; also clears the backlog item 'add formules to the App Tester truck')". Run by Claude with scripts/db-migrate.cjs.
-- Three formules on test-truck-3-2 (slug app-tester), each made of App Tester's own categories (pizza, drinks, dough-balls,
-- desserts), active and applied to new events — so they show on its order page's Formules tab and in its dashboard. Fixed ids,
-- so the order checks (scripts/deals-order-1-live.cjs) can name them. Each goes to the BOTTOM of the truck's list, the rule a
-- new formule follows (the truck's highest sort_order + 1): App Tester has none, so 1, 2, 3.
-- Idempotent (on conflict do nothing); writes nothing if the truck is not there under that slug. No other truck is touched.
begin;

insert into public.bundles_db (id, truck_id, name, description, bundle_price, original_price, is_available, apply_to_new_events,
                               slot_1_category, slot_2_category, sort_order)
select v.id::uuid, 'test-truck-3-2', v.name, v.description, v.price, v.original, true, true, v.s1, v.s2,
       coalesce((select max(sort_order) from public.bundles_db where truck_id = 'test-truck-3-2'), 0) + v.n
  from (values
    (1, 'd0000001-0000-4000-8000-00000000a001', 'Pizza + Drink',       'Any pizza and any drink',       14.50, 16.50, 'pizza',       'drinks'),
    (2, 'd0000001-0000-4000-8000-00000000a002', 'Dough Balls + Drink', 'Dough balls and any drink',      7.50,  8.50, 'dough-balls', 'drinks'),
    (3, 'd0000001-0000-4000-8000-00000000a003', 'Pizza + Dessert',     'Any pizza and any dessert',     16.00, 18.50, 'pizza',       'desserts')
  ) as v(n, id, name, description, price, original, s1, s2)
 where exists (select 1 from public.trucks where id = 'test-truck-3-2' and slug = 'app-tester')
on conflict (id) do nothing;

commit;
