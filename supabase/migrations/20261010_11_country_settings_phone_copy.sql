-- 20261010_11_country_settings_phone_copy.sql
-- Phase 2C (phone numbers follow the truck's country): two new country settings the phone copy reads.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent: `add column if not exists`, and each seed fills a value only where it is still
--    NULL — so a second run changes nothing, and a value edited later on the Countries page is never
--    overwritten by a re-run.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN BEFORE THE PHASE 2C CODE IS TESTED OR DEPLOYED. The loader selects both
--    columns by name (lib/country-settings.ts), so code deployed before this file 42703s on every settings
--    read. Both columns are NULLABLE on purpose: a country added on the Countries page without them still
--    loads, and the screens that need a value say so loudly rather than guessing (lib/phone.ts).
--
-- ── WHAT THEY ARE ───────────────────────────────────────────────────────────────────────────────────
--   short_name     how the country is named inside a sentence: "Please enter a valid UK mobile …"
--   phone_example  the example number shown in phone placeholders and error messages, written the way a
--                  person in that country writes one. GB's is today's example, so UK copy is unchanged.
--
-- VERIFY AFTER APPLYING:
--   select country_code, short_name, phone_example from public.country_settings order by country_code;
--     -- expect GB | UK | 07700 900123  and  US | US | (201) 555-0123

set lock_timeout = '3s';

begin;

alter table public.country_settings add column if not exists short_name    text;
alter table public.country_settings add column if not exists phone_example text;

update public.country_settings set short_name    = 'UK'             where country_code = 'GB' and short_name    is null;
update public.country_settings set phone_example = '07700 900123'   where country_code = 'GB' and phone_example is null;
update public.country_settings set short_name    = 'US'             where country_code = 'US' and short_name    is null;
update public.country_settings set phone_example = '(201) 555-0123' where country_code = 'US' and phone_example is null;

comment on column public.country_settings.short_name is
  'How the country is named inside a sentence ("a valid UK mobile"). Nullable: screens that need it say so loudly when it is missing. Phase 2C.';
comment on column public.country_settings.phone_example is
  'The example phone number shown in placeholders and phone error messages, in the country''s own written form. Nullable, as short_name. Phase 2C.';

commit;
