-- 20261119_languages_switch_1.sql — languages-switch-1 (Dominic, 19 November 2026, docs/languages-switch-1-report.md).
-- Points four live countries at their own language. Each locale was confirmed LIVE on www.hatchgrab.com first
-- (/forgot-password?lang=<locale> served <html lang="<locale>"> with that language's strings, 19 Nov 2026).
--   AL Albania             en-GB → sq-AL
--   AD Andorra             es-ES → ca-AD
--   BA Bosnia & Herzegovina hr-HR → bs-BA
--   MK North Macedonia     en-GB → mk-MK
-- India (IN) and Pakistan (PK) stay on en-GB (Dominic): hi-IN and ur-PK stay installed but on no row.
-- Each UPDATE only fires if the row still has the old locale, so a re-run changes nothing.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_languages_switch_1.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.country_settings set locale = 'sq-AL', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'AL' and locale = 'en-GB';

update public.country_settings set locale = 'ca-AD', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'AD' and locale = 'es-ES';

update public.country_settings set locale = 'bs-BA', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'BA' and locale = 'hr-HR';

update public.country_settings set locale = 'mk-MK', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'MK' and locale = 'en-GB';

commit;

-- VERIFY (read-only):
-- select country_code, locale, enabled, updated_by from public.country_settings where country_code in ('AL', 'AD', 'BA', 'MK') order by 1;
