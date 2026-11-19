-- 20261119_languages_switch_short_names.sql — languages-switch-2 report (Dominic, 19 November 2026, docs/languages-switch-2-report.md).
-- After languages-switch-1 (20261119_languages_switch_1.sql) put Albania on sq-AL and North Macedonia on mk-MK, their
-- country_settings.short_name was still English, so landing.meta.title read "… HatchGrab Albania" / "… HatchGrab North Macedonia".
-- short_name is used inside the country's own-language copy (lib/marketing-meta.ts, phone copy, plans PDF, llms text), as
-- AM "Հայաստան", GE "საქართველო", UA "Україна" and BA "Bosna i Hercegovina" already are. Names are Intl.DisplayNames' own names.
-- Andorra ("Andorra") and Bosnia ("Bosna i Hercegovina") already show their own-language names — not changed.
-- Each UPDATE only fires if the row still has the English name, so a re-run changes nothing.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_languages_switch_short_names.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.country_settings set short_name = 'Shqipëri', updated_at = now(), updated_by = 'languages-switch-2 short_name'
 where country_code = 'AL' and short_name = 'Albania';

update public.country_settings set short_name = 'Северна Македонија', updated_at = now(), updated_by = 'languages-switch-2 short_name'
 where country_code = 'MK' and short_name = 'North Macedonia';

commit;

-- VERIFY (read-only):
-- select country_code, locale, short_name, updated_by from public.country_settings where country_code in ('AL', 'MK') order by 1;
