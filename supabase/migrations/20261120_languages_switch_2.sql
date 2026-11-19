-- 20261120_languages_switch_2.sql — languages-switch-2 (Dominic, 19 November 2026, docs/languages-switch-1-report.md).
-- ⛔ NOT RUN. Run it only AFTER Dominic's next deploy has put sw-TZ and si-LK on www.hatchgrab.com. Check first that
-- /forgot-password?lang=sw-TZ and ?lang=si-LK each serve <html lang="<locale>"> with translated strings; if a locale is not
-- live, the site would fall back to en-GB for that country (Tanzania is on en-KE today).
--   LK Sri Lanka  en-GB → si-LK   (Sinhala, not ta-LK — Dominic; ta-LK stays installed but on no row)
--   TZ Tanzania   en-KE → sw-TZ
-- Each UPDATE only fires if the row still has the old locale, so a re-run changes nothing.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261120_languages_switch_2.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.country_settings set locale = 'si-LK', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'LK' and locale = 'en-GB';

update public.country_settings set locale = 'sw-TZ', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'TZ' and locale = 'en-KE';

commit;

-- VERIFY (read-only):
-- select country_code, locale, enabled, updated_by from public.country_settings where country_code in ('LK', 'TZ') order by 1;
