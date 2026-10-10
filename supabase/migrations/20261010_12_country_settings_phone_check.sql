-- 20261010_12_country_settings_phone_check.sql
-- Country settings: HOW STRICTLY a country's phone numbers are checked — one setting, three choices.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent: `add column if not exists`, and the CHECK is added only when it is not already
--    there, so a second run changes nothing.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN AFTER 20261010_11 AND BEFORE THIS CODE IS TESTED OR DEPLOYED. The loader
--    selects the column by name (lib/country-settings.ts), so code deployed before this file 42703s on every
--    settings read. Every existing row gets 'length' from the default — exactly what Phase 2C does today.
--
-- ── THE THREE CHOICES (lib/phone.ts isPlausiblePhone) ────────────────────────────────────────────────
--   length  a number of a plausible length for its country (libphonenumber "possible") — today's behaviour
--   strict  a real number only (libphonenumber "valid": the country's own numbering plan)
--   off     anything that is not empty
-- A number starting with + (a visiting customer) is checked with the TRUCK's choice, in its own country.
--
-- VERIFY AFTER APPLYING:
--   select country_code, phone_check from public.country_settings order by country_code;
--     -- expect 'length' on every row
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.country_settings'::regclass and conname = 'country_settings_phone_check_chk';

set lock_timeout = '3s';

begin;

alter table public.country_settings
  add column if not exists phone_check text not null default 'length';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.country_settings'::regclass
       and conname = 'country_settings_phone_check_chk'
  ) then
    alter table public.country_settings
      add constraint country_settings_phone_check_chk check (phone_check in ('length', 'strict', 'off'));
  end if;
end $$;

comment on column public.country_settings.phone_check is
  'How phone numbers are checked for this country: length (plausible length — libphonenumber "possible"), strict (real numbers only — libphonenumber "valid"), off (anything not empty). A + number is checked in its own country with the truck''s choice.';

commit;
