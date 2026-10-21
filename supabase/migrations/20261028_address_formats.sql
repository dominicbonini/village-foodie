-- 20261028_address_formats.sql — address-formats-1 (21 October 2026; docs/address-formats-1-report.md).
-- ⚠️ NOT RUN when written. "RUN AFTER DEPLOY": the code before this stage refuses any address_format other than
-- 'postcode' / 'zip_state' (lib/country-settings.ts mapCountryRow), so mapping the rows first would take every country out
-- of every list. The code from this stage accepts BOTH the legacy values and the keys, so after the deploy this is safe.
--
-- 🔴 country_settings.address_format holds a KEY of lib/address-formats.ts (ADDRESS_FORMAT_KEYS, same order).
-- scripts/address-formats-1.cjs fails if this list and the config ever differ — adding a format is BOTH edits.
-- The legacy values map to the format that behaves exactly as they did: 'postcode' → gb, 'zip_state' → us. Ireland,
-- Australia and New Zealand (all switched off) move to their own formats.
begin;

alter table public.country_settings drop constraint if exists country_settings_address_format_chk;

update public.country_settings set address_format = 'gb', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'GB' and address_format = 'postcode';
update public.country_settings set address_format = 'us', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'US' and address_format = 'zip_state';
update public.country_settings set address_format = 'ie', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'IE' and address_format = 'postcode';
update public.country_settings set address_format = 'au', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'AU' and address_format = 'postcode';
update public.country_settings set address_format = 'nz', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'NZ' and address_format = 'postcode';

alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca'));

commit;

-- verify — after the commit: every row on a key, none left on a legacy value
select country_code, enabled, address_format, updated_by from public.country_settings order by country_code;
