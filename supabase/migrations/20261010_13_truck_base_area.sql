-- 20261010_13_truck_base_area.sql
-- Phase 2D-1: WHERE A TRUCK IS BASED — its town or city, asked at signup and editable in Manage › Settings ›
-- Where you trade.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--    Idempotent: every column is `add column if not exists`, so a second run changes nothing.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN AFTER 20261010_12 AND BEFORE THIS CODE IS TESTED OR DEPLOYED — signup and
--    Settings write these columns. Every column is NULLABLE and every existing truck stays NULL: nothing is
--    backfilled, and an existing truck fills these in on Manage › Settings › Where you trade.
--
-- 🟡 REWRITTEN 10 October 2026 (docs/remove-travel-distance-report.md). The first version also added
--    trucks.travel_radius_km and country_settings.distance_unit, for a "How far do you usually travel?"
--    question that has since been removed. Neither is added here any more. If that first version was already
--    run, 20261010_14 marks both columns retired (it drops nothing).
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, numeric_precision, numeric_scale, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'trucks'
--      and column_name in ('base_place_id','base_place_name','base_region','base_lat','base_lng');
--   -- expect five rows, all is_nullable = YES, base_lat/base_lng numeric(9,6)

set lock_timeout = '3s';

begin;

alter table public.trucks add column if not exists base_place_id    text;
alter table public.trucks add column if not exists base_place_name  text;
alter table public.trucks add column if not exists base_region      text;
alter table public.trucks add column if not exists base_lat         numeric(9,6);
alter table public.trucks add column if not exists base_lng         numeric(9,6);

comment on column public.trucks.base_place_id is
  'Google Places place id of the town or city the truck is based in (Places API New). NULL when typed freely or not given. Phase 2D-1.';
comment on column public.trucks.base_place_name is
  'The town or city the truck is based in, as shown to the operator ("Sudbury"). Free text when no suggestion was picked. Phase 2D-1.';
comment on column public.trucks.base_region is
  'The county (GB) or state (US) of the base town, from Places; NULL when typed freely. Phase 2D-1.';
comment on column public.trucks.base_lat is
  'Latitude of the base town, from Places; NULL when typed freely. Phase 2D-1.';
comment on column public.trucks.base_lng is
  'Longitude of the base town, from Places; NULL when typed freely. Phase 2D-1.';

commit;
