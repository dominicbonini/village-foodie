-- 20261027_currency_registry.sql — currency-registry (21 October 2026; docs/currency-registry-report.md).
-- ⚠️ NOT RUN when written. "RUN NOW": it only narrows what a row may hold, and every existing row passes (checked
-- read-only: GB GBP, IE EUR, US USD — 3 of 3). The app already refuses any other currency (lib/country-settings.ts
-- mapCountryRow; lib/admin/country-form.ts), so this can run before or after the deploy.
--
-- 🔴 country_settings.currency may only be a currency the registry lists (lib/currencies.ts CURRENCY_CODES, same order).
-- scripts/currency-registry.cjs fails if this list and the registry ever differ — adding a currency is BOTH edits.
-- It replaces the old CHECK of the same name, which allowed any three capital letters.
begin;

alter table public.country_settings drop constraint country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON'));

commit;
