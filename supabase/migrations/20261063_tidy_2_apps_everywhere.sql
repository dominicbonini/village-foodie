-- 20261063_tidy_2_apps_everywhere.sql — tidy-2 item 1 (3 November 2026, docs/tidy-2-report.md): THE APPS ARE ON IN EVERY COUNTRY.
--
-- WHY: Dominic decided (tidy-2 brief) that the iPhone/iPad and Android apps are a core feature and will be in every store before
-- customers arrive, so every country_settings row — enabled or not — says both apps are available.
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (the country_settings write is his explicit approval in the tidy-2
-- brief). Only ios_app_available and android_app_available are written; no other column, no row added or removed. Safe to run twice.
-- Read live before it ran (3 Nov 2026): 44 rows; GB had both true, the other 43 both false.

begin;

do $$
declare total_before integer; total_after integer; changed integer;
begin
  select count(*) into total_before from public.country_settings;

  update public.country_settings set ios_app_available = true, android_app_available = true
   where ios_app_available is distinct from true or android_app_available is distinct from true;
  get diagnostics changed = row_count;

  select count(*) into total_after from public.country_settings;
  if total_after <> total_before then
    raise exception 'tidy-2: country_settings has % rows, expected %', total_after, total_before;
  end if;
  if exists (select 1 from public.country_settings where ios_app_available is distinct from true or android_app_available is distinct from true) then
    raise exception 'tidy-2: a country still has an app flag that is not true';
  end if;
  raise notice 'tidy-2: % of % country rows switched to both apps available', changed, total_after;
end $$;

commit;
