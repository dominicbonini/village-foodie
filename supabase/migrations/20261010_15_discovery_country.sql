-- 20261010_15_discovery_country.sql
-- Phase 2D-2 Part A: COUNTRY ON DISCOVERY DATA, and unique keys that are scoped to a country.
-- docs/schedules-country-report.md §1.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--
-- ✅ RUN NOW — BEFORE THE PHASE 2D-2 CODE IS DEPLOYED. Additive and safe to run twice:
--   • every column is `add column if not exists`; each foreign key and index is created only when missing;
--   • `country text not null default 'GB'` with a CONSTANT default is a catalogue-only change in Postgres 11+:
--     existing rows read 'GB' through the default and NO ROW IS REWRITTEN. Adding the foreign key scans each
--     table once to check it (every row is 'GB', which country_settings holds) — a read, not a rewrite;
--   • the three new unique indexes are COMPATIBLE WITH TODAY'S DATA because today's single-column keys are
--     stricter: every pair of rows that would clash on (country, name) already clashes on (name).
-- ⚠️ THE NEW CODE NEEDS THIS FIRST. It upserts on (country, name) and (country, name, village), and PostgREST
--    refuses an onConflict target that has no matching unique index (42P10). Order: this file → deploy →
--    20261010_16 (drops the old global keys).
--
-- 🔴 THE 'GB' DEFAULT STAYS ON PURPOSE. The automated UK sources — the scraper (scripts/run-scraper.js) and the
--    Apps Script (outside this repo) — write discovery rows WITHOUT a country. The default keeps every one of
--    their rows correct. Every in-repo writer that knows its country passes it explicitly.
--
-- VERIFY AFTER APPLYING (read-only):
--   select table_name, column_name, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and column_name in ('country', 'region')
--      and table_name in ('discovery_trucks', 'venues', 'discovery_events', 'discovery_exclusion_terms');
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and indexname in ('discovery_trucks_country_name_uniq',
--      'discovery_trucks_country_norm_name_uniq', 'venues_country_name_village_uniq');
--   select country, count(*) from public.discovery_trucks group by 1;   -- every row 'GB'

set lock_timeout = '3s';

begin;

-- ── 1. COUNTRY (and a venue's region) ───────────────────────────────────────────────────────────────────
alter table public.discovery_trucks           add column if not exists country text not null default 'GB';
alter table public.venues                     add column if not exists country text not null default 'GB';
alter table public.venues                     add column if not exists region  text;
alter table public.discovery_events           add column if not exists country text not null default 'GB';
alter table public.discovery_exclusion_terms  add column if not exists country text not null default 'GB';

do $$
declare
  t text;
begin
  foreach t in array array['discovery_trucks', 'venues', 'discovery_events', 'discovery_exclusion_terms'] loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', t)::regclass and conname = t || '_country_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (country) references public.country_settings (country_code)',
        t, t || '_country_fkey');
    end if;
  end loop;
end $$;

comment on column public.discovery_trucks.country is
  'ISO country the truck trades in (FK country_settings). Defaults to GB because the automated UK sources (scraper, Apps Script) write without a country; every in-repo writer that knows the country passes it. Name matching only ever compares trucks in the same country. Phase 2D-2.';
comment on column public.venues.country is
  'ISO country of the venue (FK country_settings). Defaults to GB because the automated UK sources write without a country. A venue only ever matches events from its own country. Phase 2D-2.';
comment on column public.venues.region is
  'County (GB) or two-letter state (US) when the source gave one; NULL otherwise. Phase 2D-2.';
comment on column public.discovery_events.country is
  'ISO country of the event, as the source or the admin asserted it at intake (FK country_settings). Defaults to GB because the automated UK sources write without a country. Village Foodie shows only GB rows. Phase 2D-2.';
comment on column public.discovery_exclusion_terms.country is
  'ISO country this exclusion term applies to (FK country_settings). Defaults to GB because the scraper writes terms without a country. A term silences truck names in its own country only. Phase 2D-2.';

-- ── 2. UNIQUE KEYS SCOPED TO A COUNTRY ──────────────────────────────────────────────────────────────────
-- The normalised-name expression is EXACTLY discovery_trucks_norm_name_uniq's, with the country in front.
create unique index if not exists discovery_trucks_country_name_uniq
  on public.discovery_trucks (country, name);
create unique index if not exists discovery_trucks_country_norm_name_uniq
  on public.discovery_trucks (country, (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));
create unique index if not exists venues_country_name_village_uniq
  on public.venues (country, name, village);

commit;
