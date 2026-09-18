-- 20260916_collection_intervals.sql
-- Two per-truck settings for WHICH collection times are selectable. Neither touches capacity.
--
-- ── WHAT THEY ARE ───────────────────────────────────────────────────────────────────────────────────
--   trucks.collection_interval_mins           EXISTING — the CUSTOMER interval. Already read by every
--                                             grid generator; it simply gains a CHECK and a UI writer.
--   trucks.operator_collection_interval_mins  NEW — the TRUCK (Add Order) interval.
-- Both are a choice of 5 / 10 / 15 / 20 / 30 minutes. The default is 5, which is what every row
-- already holds for the existing column, so applying this changes what NO truck sees.
--
-- ── 🔴 THIS IS A SELECTION SETTING, NOT A CAPACITY ONE ──────────────────────────────────────────────
-- The engine (§31: projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot) reads prep
-- times, batch sizes, kitchen_capacity and capacity_window_mins. It does NOT read either column here.
-- A 15-minute grid changes which times can be picked; the oven windows stay prep-length.
--
-- ⚠️ THE EXISTING COLUMN IS NULLABLE AND STAYS SO. Its CHECK admits null (read as 5 in code) so no
-- live row can fail it: every trucks row reads 5 today.
-- ⚠️ THE NEW COLUMN IS NOT NULL DEFAULT 5, so a row that has never been written reads 5 with no
-- coalescing needed — and `add column if not exists` is used, which is why the verification query in
-- the build report must be run after applying (a column that already existed with a different shape
-- would not be reshaped by this file).

set lock_timeout = '3s';

begin;

alter table public.trucks
  add column if not exists operator_collection_interval_mins integer not null default 5;

alter table public.trucks
  drop constraint if exists trucks_operator_collection_interval_mins_check;
alter table public.trucks
  add constraint trucks_operator_collection_interval_mins_check
  check (operator_collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.trucks
  drop constraint if exists trucks_collection_interval_mins_check;
alter table public.trucks
  add constraint trucks_collection_interval_mins_check
  check (collection_interval_mins is null or collection_interval_mins in (5, 10, 15, 20, 30));

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND THE NEW COLUMN READS AS ABSENT (PGRST204).
-- The code falls back to 5 in that case, so nothing breaks — but the setting would not take effect.
notify pgrst, 'reload schema';
