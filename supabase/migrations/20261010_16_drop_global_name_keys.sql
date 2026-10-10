-- 20261010_16_drop_global_name_keys.sql
-- Phase 2D-2 Part A: drop the three GLOBAL unique keys that forbid a same-named truck or venue in another
-- country. docs/schedules-country-report.md §1.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--
-- 🔴 DEPLOY-COUPLED — RUN ONLY AFTER 20261010_15 HAS RUN AND THE PHASE 2D-2 CODE IS DEPLOYED.
--    Every in-repo writer now names the country-scoped targets — (country, name) and (country, name, village)
--    — which 20261010_15 created. Before the deploy, the live code still names onConflict 'name' and
--    'name,village'; dropping these keys under it turns every one of those writes into 42P10.
--    Writers checked: scripts/run-scraper.js, lib/discovery-gate.ts, the admin screenshot truck insert,
--    scripts/import-hatchesup-schedule.js, scripts/process-next-truck.js, scripts/migrate-from-sheets.cjs.
--    The Apps Script (docs/apps-script/village-foodie-v6.57.js, reference copy) writes no discovery_trucks or
--    venues row directly — it posts to /api/inbound-schedule — so nothing outside the repo names these keys.
--
-- ✅ SAFE TO RUN TWICE. Each key is dropped only if it is there, as a constraint or as a plain index (the
--    two global truck keys and the venue key were made by hand, so the form is checked rather than assumed).
--    It drops no column and changes no data.
--
-- CHECK BEFORE RUNNING (read-only) — all three new indexes must exist and be valid:
--   select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname in ('discovery_trucks_country_name_uniq', 'discovery_trucks_country_norm_name_uniq',
--                        'venues_country_name_village_uniq');
--   -- expect three rows, indisvalid = true
--
-- VERIFY AFTER APPLYING (read-only):
--   select conname from pg_constraint where conname in ('discovery_trucks_name_key', 'venues_name_village_key');
--   select indexname from pg_indexes where schemaname = 'public'
--      and indexname in ('discovery_trucks_name_key', 'discovery_trucks_norm_name_uniq', 'venues_name_village_key');
--   -- expect zero rows from both

set lock_timeout = '3s';

begin;

do $$
declare
  k record;
begin
  for k in
    select * from (values
      ('discovery_trucks', 'discovery_trucks_name_key'),
      ('discovery_trucks', 'discovery_trucks_norm_name_uniq'),
      ('venues',           'venues_name_village_key')
    ) as v(tbl, key_name)
  loop
    if exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', k.tbl)::regclass and conname = k.key_name
    ) then
      execute format('alter table public.%I drop constraint %I', k.tbl, k.key_name);
    elsif exists (
      select 1 from pg_indexes where schemaname = 'public' and tablename = k.tbl and indexname = k.key_name
    ) then
      execute format('drop index public.%I', k.key_name);
    end if;
  end loop;
end $$;

commit;
