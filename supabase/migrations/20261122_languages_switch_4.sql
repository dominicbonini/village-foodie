-- 20261122_languages_switch_4.sql — languages-switch-4 (Dominic, 22 November 2026, docs/languages-switch-4-report.md).
-- Cambodia → km-KH, Laos → lo-LA, Ethiopia → am-ET, each with its own-language country_settings.short_name
-- (Intl.DisplayNames of the locale: កម្ពុជា, ລາວ, ኢትዮጵያ — as AL "Shqipëri", MK "Северна Македонија", LK "ශ්‍රී ලංකාව").
-- Run only after the LIVE site served all three locales (checked 22 Nov: /forgot-password?lang=… → <html lang="km-KH|lo-LA|am-ET">
-- with translated headings); an unknown locale would fall back to en-GB (resolveLocale, lib/i18n/locales.ts).
-- Guarded on the current locale AND short_name, so a re-run (or a row someone changed meanwhile) changes nothing.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261122_languages_switch_4.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.country_settings set locale = 'km-KH', short_name = 'កម្ពុជា', updated_at = now(), updated_by = 'languages-switch-4'
 where country_code = 'KH' and locale = 'en-GB' and short_name = 'Cambodia';
update public.country_settings set locale = 'lo-LA', short_name = 'ລາວ', updated_at = now(), updated_by = 'languages-switch-4'
 where country_code = 'LA' and locale = 'en-GB' and short_name = 'Laos';
update public.country_settings set locale = 'am-ET', short_name = 'ኢትዮጵያ', updated_at = now(), updated_by = 'languages-switch-4'
 where country_code = 'ET' and locale = 'en-KE' and short_name = 'Ethiopia';

commit;

-- VERIFY (read-only):
-- select country_code, locale, short_name, updated_by from public.country_settings where country_code in ('KH','LA','ET');
