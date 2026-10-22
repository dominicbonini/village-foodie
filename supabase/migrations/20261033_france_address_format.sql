-- france-1 (22 October 2026, docs/france-1-report.md §9) — BLOCK A, "RUN NOW" (before or after the deploy; either is safe).
-- ⚠️ NOT RUN when written. Widens the address-format CHECK to France's format ('fr', lib/address-formats.ts: street, 5-digit
-- code postal, ville; no region). No row holds 'fr' yet, so nothing changes for anyone. It must run BEFORE block B
-- (20261034_france_row.sql), whose FR row says address_format = 'fr'.
begin;
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr'));
commit;

-- Check: select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_address_format_chk';
