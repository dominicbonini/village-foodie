-- europe-settings (22 October 2026, docs/europe-settings-report.md §9) — BLOCK A, "RUN NOW" (before or after the deploy; either
-- is safe). ⚠️ NOT RUN when written. Widens the address-format CHECK to the 29 European formats (lib/address-formats.ts
-- EUROPE_ROWS). No row holds any of them yet, so nothing changes for anyone. It must run BEFORE block B
-- (20261036_europe_rows.sql). It also keeps France's 'fr' (france-1's block A, 20261033 — run either first; this one is a superset).
-- The currency CHECK already allows every currency these rows use (EUR, CHF, CZK, DKK, GBP, HUF, NOK, PLN, RON, SEK); the
-- allergen-set CHECK already allows 'uk14'. No other CHECK changes.
begin;
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi', 'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch'));
commit;

-- Check: select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_address_format_chk';
