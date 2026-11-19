-- 20261119_languages_switch_lk_short_name.sql — languages-switch-3 (Dominic, 19 November 2026, docs/languages-switch-3-report.md).
-- Sri Lanka went on si-LK (20261120_languages_switch_2.sql) but its country_settings.short_name was still the English "Sri Lanka",
-- so landing.meta.title read "Food truck ඇණවුම් පද්ධතිය — HatchGrab Sri Lanka". short_name is used inside the country's own-language
-- copy (lib/marketing-meta.ts, phone copy, plans PDF, llms text), as AL "Shqipëri" and MK "Северна Македонија" now are.
-- The name is Intl.DisplayNames('si-LK').of('LK') — ශ + ් + U+200D (zero-width joiner) + ර + ී, space, ල ං ක ා ව — byte-identical.
-- Guarded on the current value, so a re-run changes nothing.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_languages_switch_lk_short_name.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.country_settings set short_name = 'ශ්‍රී ලංකාව', updated_at = now(), updated_by = 'languages-switch-3 short_name'
 where country_code = 'LK' and short_name = 'Sri Lanka';

commit;

-- VERIFY (read-only):
-- select country_code, locale, short_name, updated_by from public.country_settings where country_code = 'LK';
