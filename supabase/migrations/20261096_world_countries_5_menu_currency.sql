-- supabase/migrations/20261096_world_countries_5_menu_currency.sql — world-countries-5 BLOCK D (12 November 2026, docs/world-countries-5-report.md §1.3).
-- Run by Claude (Dominic, 12 Nov: "menus use local money in all 11 … Add the menu-currency column (default = the existing currency, so no other
-- country changes), run that migration yourself") with scripts/db-migrate.cjs --approved-by-dominic.
-- 1 · country_settings_currency_chk — the registry's 127 codes (lib/currencies.ts): + the 11 menu currencies below.
-- 2 · country_settings.menu_currency — THE MONEY A TRUCK'S MENU IS PRICED IN, when it is not the money HatchGrab bills in (`currency`, which
--     plan_prices follow). NULL = the same as `currency` (lib/country-settings.ts mapCountryRow) — so every other country, live or new, is
--     unchanged, with no row written. Checked against the same registry list.
-- 3 · the 11 countries billed in USD or EUR whose own money differs: their menus use it. All 11 rows are switched off (block B).
begin;

alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB', 'ALL', 'AMD', 'AZN', 'BAM', 'GEL', 'ISK', 'MDL', 'MKD', 'RSD', 'TRY', 'UAH', 'XCD', 'ARS', 'AWG', 'BSD', 'BZD', 'BMD', 'BOB', 'KYD', 'CLP', 'COP', 'CRC', 'XCG', 'DOP', 'FKP', 'GTQ', 'GYD', 'HNL', 'JMD', 'NIO', 'PAB', 'PYG', 'PEN', 'SRD', 'TTD', 'UYU', 'BDT', 'BND', 'KHR', 'FJD', 'XPF', 'INR', 'IDR', 'KZT', 'KRW', 'KGS', 'LAK', 'MOP', 'MVR', 'MNT', 'NPR', 'PKR', 'PGK', 'WST', 'SBD', 'LKR', 'TWD', 'TJS', 'TOP', 'UZS', 'VUV', 'ILS', 'QAR', 'SAR', 'DZD', 'AOA', 'XOF', 'BWP', 'BIF', 'CVE', 'XAF', 'KMF', 'DJF', 'EGP', 'SZL', 'ETB', 'GMD', 'GNF', 'LSL', 'LRD', 'MGA', 'MWK', 'MUR', 'MAD', 'MZN', 'NAD', 'NGN', 'SHP', 'SCR', 'SLE', 'ZAR', 'TZS', 'UGX', 'ZMW', 'BHD', 'JOD', 'KWD', 'OMR', 'TND', 'BTN', 'TMT', 'ERN', 'MRU', 'STN', 'ZWG'));

alter table public.country_settings add column if not exists menu_currency text;
alter table public.country_settings drop constraint if exists country_settings_menu_currency_chk;
alter table public.country_settings add constraint country_settings_menu_currency_chk
  check (menu_currency is null or menu_currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB', 'ALL', 'AMD', 'AZN', 'BAM', 'GEL', 'ISK', 'MDL', 'MKD', 'RSD', 'TRY', 'UAH', 'XCD', 'ARS', 'AWG', 'BSD', 'BZD', 'BMD', 'BOB', 'KYD', 'CLP', 'COP', 'CRC', 'XCG', 'DOP', 'FKP', 'GTQ', 'GYD', 'HNL', 'JMD', 'NIO', 'PAB', 'PYG', 'PEN', 'SRD', 'TTD', 'UYU', 'BDT', 'BND', 'KHR', 'FJD', 'XPF', 'INR', 'IDR', 'KZT', 'KRW', 'KGS', 'LAK', 'MOP', 'MVR', 'MNT', 'NPR', 'PKR', 'PGK', 'WST', 'SBD', 'LKR', 'TWD', 'TJS', 'TOP', 'UZS', 'VUV', 'ILS', 'QAR', 'SAR', 'DZD', 'AOA', 'XOF', 'BWP', 'BIF', 'CVE', 'XAF', 'KMF', 'DJF', 'EGP', 'SZL', 'ETB', 'GMD', 'GNF', 'LSL', 'LRD', 'MGA', 'MWK', 'MUR', 'MAD', 'MZN', 'NAD', 'NGN', 'SHP', 'SCR', 'SLE', 'ZAR', 'TZS', 'UGX', 'ZMW', 'BHD', 'JOD', 'KWD', 'OMR', 'TND', 'BTN', 'TMT', 'ERN', 'MRU', 'STN', 'ZWG'));
comment on column public.country_settings.menu_currency is 'world-countries-5: the currency truck menus are priced in, when it differs from currency (what HatchGrab bills in). NULL = currency.';

update public.country_settings set menu_currency = 'BHD', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'BH' and enabled = false;
update public.country_settings set menu_currency = 'JOD', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'JO' and enabled = false;
update public.country_settings set menu_currency = 'KWD', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'KW' and enabled = false;
update public.country_settings set menu_currency = 'OMR', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'OM' and enabled = false;
update public.country_settings set menu_currency = 'TND', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'TN' and enabled = false;
update public.country_settings set menu_currency = 'BTN', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'BT' and enabled = false;
update public.country_settings set menu_currency = 'TMT', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'TM' and enabled = false;
update public.country_settings set menu_currency = 'ERN', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'ER' and enabled = false;
update public.country_settings set menu_currency = 'MRU', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'MR' and enabled = false;
update public.country_settings set menu_currency = 'STN', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'ST' and enabled = false;
update public.country_settings set menu_currency = 'ZWG', updated_at = now(), updated_by = 'world-countries-5' where country_code = 'ZW' and enabled = false;

commit;
