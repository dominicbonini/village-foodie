-- supabase/migrations/20261097_world_countries_5_mx_store_flags_off.sql — world-countries-5 (12 November 2026, docs/world-countries-5-report.md §6).
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (Dominic, 12 Nov: "set MX's ios_app_available and android_app_available to false
-- now (live-row update, I approve)"). Mexico is on the cannot-sell list: the app was taken off Mexico's App Store on 12 Nov, and Mexico switches
-- off in 20261095 (not run yet). Until then /mx would show store badges for apps not sold there; with both flags off it shows none.
-- Changes exactly one row, MX; nothing else.
begin;

update public.country_settings
   set ios_app_available = false, android_app_available = false, updated_at = now(), updated_by = 'world-countries-5 (Mexico store badges off)'
 where country_code = 'MX';

commit;
