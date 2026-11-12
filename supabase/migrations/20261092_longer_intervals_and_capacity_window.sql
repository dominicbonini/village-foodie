-- 20261092_longer_intervals_and_capacity_window.sql — 12 November 2026: LONGER COLLECTION TIMES AND A LONGER CAPACITY WINDOW.
-- Manage › Settings › Customer / Your Collection Times now also offers 45 and 60 minutes (lib/slot-interval-core.ts
-- INTERVAL_CHOICES = 5, 10, 15, 20, 30, 45, 60), and the kitchen-capacity window now runs 1–15 minutes then every 5 minutes to 60
-- (lib/kitchen-capacity.ts CAPACITY_WINDOW_OPTIONS). The CHECKs below are the backstop for those lists, so they widen with them.
-- WIDENING ONLY: every value allowed before is still allowed, so no existing row can fail and no row changes. The window CHECK
-- stays a range (1–60), not a list, so a van saved at 16–19 minutes before this change keeps its value.
-- Prep time (menu_categories.prep_secs) has no CHECK; its new 20–60 minute options need no schema change.
begin;

alter table public.trucks drop constraint if exists trucks_collection_interval_mins_check;
alter table public.trucks add constraint trucks_collection_interval_mins_check
  check (collection_interval_mins is null or collection_interval_mins in (5, 10, 15, 20, 30, 45, 60));

alter table public.truck_vans drop constraint if exists truck_vans_collection_interval_mins_check;
alter table public.truck_vans add constraint truck_vans_collection_interval_mins_check
  check (collection_interval_mins in (5, 10, 15, 20, 30, 45, 60));

alter table public.truck_vans drop constraint if exists truck_vans_operator_collection_interval_mins_check;
alter table public.truck_vans add constraint truck_vans_operator_collection_interval_mins_check
  check (operator_collection_interval_mins is null or operator_collection_interval_mins in (5, 10, 15, 20, 30, 45, 60));

alter table public.truck_events drop constraint if exists truck_events_collection_interval_mins_override_check;
alter table public.truck_events add constraint truck_events_collection_interval_mins_override_check
  check (collection_interval_mins_override is null or collection_interval_mins_override in (5, 10, 15, 20, 30, 45, 60));

alter table public.truck_events drop constraint if exists truck_events_operator_collection_interval_mins_override_check;
alter table public.truck_events add constraint truck_events_operator_collection_interval_mins_override_check
  check (operator_collection_interval_mins_override is null or operator_collection_interval_mins_override in (5, 10, 15, 20, 30, 45, 60));

alter table public.truck_vans drop constraint if exists truck_vans_capacity_window_mins_check;
alter table public.truck_vans add constraint truck_vans_capacity_window_mins_check
  check (capacity_window_mins between 1 and 60);

commit;

-- Verify (read only):
-- select t.relname, c.conname, pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on t.oid = c.conrelid
--  where c.contype = 'c' and (pg_get_constraintdef(c.oid) ilike '%interval_mins%' or pg_get_constraintdef(c.oid) ilike '%capacity_window%') order by 1, 2;
