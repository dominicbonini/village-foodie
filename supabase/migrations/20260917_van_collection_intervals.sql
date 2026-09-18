-- 20260917_van_collection_intervals.sql
-- Collection intervals move from the TRUCK to the VAN.
--
-- ── WHY THE VAN AND NOT THE TRUCK ───────────────────────────────────────────────────────────────────
-- Everything else that shapes a service already lives on truck_vans: kitchen_capacity,
-- capacity_window_mins, buzzer_count, order_ready_enabled. An event resolves its van and reads them
-- from there. A truck with two vans can run two events on one day with different kitchens, and the
-- collection grid is a property of the service, not of the business — so it belongs beside the
-- capacity settings that are already resolved the same way.
--
-- ── THE TWO COLUMNS ─────────────────────────────────────────────────────────────────────────────────
--   collection_interval_mins           NOT NULL DEFAULT 5. The CUSTOMER grid for events on this van.
--   operator_collection_interval_mins  NULLABLE, NO DEFAULT. The van's own override for orders the
--                                      operator adds. 🔴 NULL MEANS "SAME AS CUSTOMERS" — it is not a
--                                      missing 5. A van with customer 15 and a NULL override gives the
--                                      operator a 15 grid, not a 5 one. The tickbox in Manage is
--                                      derived from this column being non-null; there is no second
--                                      stored flag to drift from it.
--
-- ── 🔴 A SELECTION SETTING, NOT A CAPACITY ONE ──────────────────────────────────────────────────────
-- The engine (§31: projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot) reads
-- prep_secs, batch_size, kitchen_capacity and capacity_window_mins. It reads NEITHER column here.
-- A 15-minute grid changes which times can be picked; the oven windows stay prep-length.
--
-- ── WHAT THIS CHANGES FOR A LIVE TRUCK: NOTHING ─────────────────────────────────────────────────────
-- Every van gets collection_interval_mins = 5 from the default and a NULL override, so both the
-- customer grid and the operator grid resolve to 5 — the value every truck reads today.
--
-- ── THE DROPPED COLUMN ──────────────────────────────────────────────────────────────────────────────
-- trucks.operator_collection_interval_mins was added by 20260916_collection_intervals.sql and is
-- dropped here. No deployed code has ever read it. `if exists` on both the constraint and the column
-- makes this a no-op when 20260916 was never applied, so the two files can be applied in either order
-- or 20260916 skipped entirely.
-- ⚠️ trucks.collection_interval_mins IS NOT TOUCHED. It stays exactly as it is, and stays readable:
-- it is still the customer interval for an event whose van cannot be resolved, which is the legacy
-- "interval 0 ⇒ fall back to collection_times" contract. It is simply no longer editable.

set lock_timeout = '3s';

begin;

alter table public.truck_vans
  add column if not exists collection_interval_mins integer not null default 5;

alter table public.truck_vans
  drop constraint if exists truck_vans_collection_interval_mins_check;
alter table public.truck_vans
  add constraint truck_vans_collection_interval_mins_check
  check (collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.truck_vans
  add column if not exists operator_collection_interval_mins integer;

alter table public.truck_vans
  drop constraint if exists truck_vans_operator_collection_interval_mins_check;
alter table public.truck_vans
  add constraint truck_vans_operator_collection_interval_mins_check
  check (operator_collection_interval_mins is null
         or operator_collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.trucks
  drop constraint if exists trucks_operator_collection_interval_mins_check;
alter table public.trucks
  drop column if exists operator_collection_interval_mins;

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND THE NEW COLUMNS READ AS ABSENT (PGRST204).
-- readVanIntervals falls back to 5/5 in that case, so nothing breaks — but no setting would take effect.
notify pgrst, 'reload schema';
