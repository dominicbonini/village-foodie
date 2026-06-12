-- 20260612_event_scoped_pause_extrawait.sql
-- Move pause + extra-wait from truck/van scope to EVENT scope (same pattern as event_item_stock and
-- truck_events.offline_protection_override). A pause/extra-wait is an EVENT activity — storing it on
-- the truck or van bled it across every other event (the "future event shows paused" bug). Applied
-- by hand in Supabase.
--
-- The legacy columns (trucks.paused_until, truck_vans.paused_until, truck_vans.online_paused_until,
-- trucks.extra_wait_mins / extra_wait_started_at) are LEFT IN PLACE — now unwritten/unread for these
-- features; removal is a post-trial cleanup, not mid-stack.
alter table truck_events
  add column if not exists paused_until            timestamptz,
  add column if not exists online_paused_until     timestamptz,
  add column if not exists extra_wait_mins         integer not null default 0,
  add column if not exists extra_wait_started_at   timestamptz;

notify pgrst, 'reload schema';
