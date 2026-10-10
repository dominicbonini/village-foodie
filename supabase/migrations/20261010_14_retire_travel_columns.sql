-- 20261010_14_retire_travel_columns.sql
-- Marks the two travel-distance columns RETIRED, if they exist. Drops nothing and changes no data.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--
-- WHY: the first version of 20261010_13 added trucks.travel_radius_km and country_settings.distance_unit for a
-- "How far do you usually travel?" signup question. The question was removed before launch (we will make our own
-- assumptions from the base town in a later phase), and 13 was rewritten without them. If the FIRST version was
-- already run, the columns exist: they are kept, not dropped, and this file says so on each column. If it was
-- not run, neither column exists and this file does nothing.
-- ✅ SAFE TO RUN TWICE, AND IN EITHER ORDER WITH THE NEW 13: each comment is guarded by an existence check, and
--    commenting a column twice leaves the same comment. The code neither reads nor writes either column.
-- ⚠️ If country_settings.distance_unit exists it keeps its NOT NULL DEFAULT 'miles' and its CHECK, so the admin
--    Countries page's inserts (which no longer name it) still succeed — the default fills it.
--
-- VERIFY AFTER APPLYING:
--   select table_name, column_name, col_description(format('public.%I', table_name)::regclass, ordinal_position) as comment
--     from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'trucks' and column_name = 'travel_radius_km')
--        or (table_name = 'country_settings' and column_name = 'distance_unit'));
--   -- zero rows (the first 13 was never run), or each row's comment starts "RETIRED 10 October 2026"

set lock_timeout = '3s';

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks' and column_name = 'travel_radius_km'
  ) then
    execute $c$comment on column public.trucks.travel_radius_km is 'RETIRED 10 October 2026 — never asked; unread and unwritten. Kept rather than dropped.'$c$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'country_settings' and column_name = 'distance_unit'
  ) then
    execute $c$comment on column public.country_settings.distance_unit is 'RETIRED 10 October 2026 — never asked; unread and unwritten. Kept rather than dropped.'$c$;
  end if;
end $$;

commit;
