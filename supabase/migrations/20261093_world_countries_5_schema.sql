-- supabase/migrations/20261093_world_countries_5_schema.sql — world-countries-5 BLOCK A (12 November 2026, docs/world-countries-5-report.md).
-- Run by Claude (Dominic approved, 12 Nov) with scripts/db-migrate.cjs, BEFORE block B (20261094). Widens what a country_settings row may
-- name; changes no existing row.
-- 1 · country_settings_currency_chk — the registry's 116 codes (lib/currencies.ts): + the 94 of the 167 new countries.
-- 2 · country_settings_address_format_chk — + 'intl' (lib/address-formats.ts: the generic format the new countries share).
-- 3 · country_settings.vat_number_required — DATA ONLY, nothing reads it yet: true where docs/world-countries-4/go-live.csv's tax is
--     vat_number_required (we must hold the truck's VAT/tax number to bill it without local tax). Default false.
begin;

alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB', 'ALL', 'AMD', 'AZN', 'BAM', 'GEL', 'ISK', 'MDL', 'MKD', 'RSD', 'TRY', 'UAH', 'XCD', 'ARS', 'AWG', 'BSD', 'BZD', 'BMD', 'BOB', 'KYD', 'CLP', 'COP', 'CRC', 'XCG', 'DOP', 'FKP', 'GTQ', 'GYD', 'HNL', 'JMD', 'NIO', 'PAB', 'PYG', 'PEN', 'SRD', 'TTD', 'UYU', 'BDT', 'BND', 'KHR', 'FJD', 'XPF', 'INR', 'IDR', 'KZT', 'KRW', 'KGS', 'LAK', 'MOP', 'MVR', 'MNT', 'NPR', 'PKR', 'PGK', 'WST', 'SBD', 'LKR', 'TWD', 'TJS', 'TOP', 'UZS', 'VUV', 'ILS', 'QAR', 'SAR', 'DZD', 'AOA', 'XOF', 'BWP', 'BIF', 'CVE', 'XAF', 'KMF', 'DJF', 'EGP', 'SZL', 'ETB', 'GMD', 'GNF', 'LSL', 'LRD', 'MGA', 'MWK', 'MUR', 'MAD', 'MZN', 'NAD', 'NGN', 'SHP', 'SCR', 'SLE', 'ZAR', 'TZS', 'UGX', 'ZMW'));

alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi', 'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch', 'br', 'mx', 'jp', 'sg', 'hk', 'my', 'th', 'ae', 'intl'));

alter table public.country_settings add column if not exists vat_number_required boolean not null default false;
comment on column public.country_settings.vat_number_required is 'world-countries-5: B2B billing here needs the truck''s VAT/tax number (go-live.csv tax = vat_number_required). Data only.';

commit;
