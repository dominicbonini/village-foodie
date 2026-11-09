-- supabase/migrations/20261083_ios_intl_1_demo_events.sql — ios-intl-1 Part 6.4 (9 November 2026; docs/ios-intl-1-report.md): the App Store
-- demo truck gets an event on every one of the next 14 days, so the App Review demo account (tester@hatchgrab.com) opens onto a working
-- schedule. Read-only check first (9 Nov): the truck's last event was 17 September and it had NONE in 9–22 November.
-- 🔴 THE DEMO TRUCK ONLY. The guard below aborts the whole file unless the truck with id 'test-truck-3-2' is owned by the operator whose
-- login is tester@hatchgrab.com — verified by id, not by name. No other truck, no live trading truck (Pizzeria Gusto or any other) is touched.
-- Same shape as its own last events (Test Event 26–28: 09:00–17:00, manual, auto open/close, its one van). Idempotent: a day that already has
-- an event for this truck is skipped, so a re-run inserts nothing.
begin;

do $$
begin
  if not exists (
    select 1 from public.trucks t join public.operators o on o.id = t.operator_id
     where t.id = 'test-truck-3-2' and lower(o.email) = 'tester@hatchgrab.com'
  ) then
    raise exception 'test-truck-3-2 is not the tester@hatchgrab.com demo truck — nothing inserted';
  end if;
end $$;

insert into public.truck_events (truck_id, venue_name, event_date, start_time, end_time, source, status, auto_open, auto_close, van_id)
select 'test-truck-3-2', 'Test Event ' || (28 + n), d::date, time '09:00', time '17:00', 'manual', 'confirmed', true, true,
       '0cde7768-ef86-473d-bfab-5d3afcb0ab6d'::uuid
  from generate_series(date '2026-11-09', date '2026-11-22', interval '1 day') with ordinality as g(d, n)
 where not exists (select 1 from public.truck_events e where e.truck_id = 'test-truck-3-2' and e.event_date = d::date);

commit;
