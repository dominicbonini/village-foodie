-- 20261030_address_suburb_region.sql — address-formats-2 (21 October 2026; docs/address-formats-2-report.md).
-- ✅ RUN NOW — before or after the deploy. ADDITIVE: two nullable columns and one more on truck_places; nothing is
-- backfilled, and the code before this stage never reads or writes them. The one DROP removes a CHECK that only the new
-- code needs gone (the old code writes only two-letter US state codes, which pass with or without it).
--
-- If the code is deployed FIRST, it is still safe: the suburb and the place region are written in their own updates
-- that fail alone (logged — the event or place still saves), read in a separate probed read (none → the line as
-- before), and a region code the CHECK would refuse ("NSW", "D") is written in its own update after the main write
-- (lib/trade-area.ts splitRegionCodeWrite) — so nothing that works today can fail. Until this runs, those values are
-- simply not kept.

-- A dependent locality — New Zealand's "Ponsonby" in "Ponsonby, Auckland 1011". Only a format with a suburb field
-- (lib/address-formats.ts) writes it.
alter table public.truck_events add column if not exists suburb text;
alter table public.truck_places add column if not exists suburb text;

-- A place's region, as its code in the truck's format's list (an Australian place's STATE, "NSW"; an Irish county, "KY").
alter table public.truck_places add column if not exists region text;

-- The two-letter CHECK on trucks.base_region_code is replaced by the app's own check against the format's list
-- (lib/trade-area.ts checkTradeArea): Australia's "NSW" and Ireland's "D" are real codes it refused.
alter table public.trucks drop constraint if exists trucks_base_region_code_chk;
