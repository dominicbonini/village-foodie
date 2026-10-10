-- 20261010_01_trucks_locale_columns.sql
-- Country settings, Part A, file 1 of 9: the three truck locale columns AS THEY ALREADY EXIST LIVE.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe.
--
-- ✅ CLASSIFICATION: ADDITIVE, AND A NO-OP ON THE LIVE DATABASE. SAFE TO RUN NOW.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────
-- trucks.country, trucks.currency and trucks.timezone exist live (confirmed by Dominic, 10 October 2026:
-- all 14 trucks are 'GB' / 'GBP' / NULL) but NO migration in this repository creates them — they were
-- added outside the repo. So the repo could not reproduce its own schema, and 20261010_05's foreign key
-- would have nothing to attach to on a fresh replay. Every statement is IF NOT EXISTS: on the live
-- database each one finds the column already there and does nothing. The definitions match the live
-- columns exactly (type, nullability, default), so a fresh database ends up identical to live.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'trucks'
--      and column_name in ('country', 'currency', 'timezone')
--    order by column_name;
--   -- expect: country text NO 'GB'::text · currency text NO 'GBP'::text · timezone text YES null

set lock_timeout = '3s';

begin;

alter table public.trucks add column if not exists country  text not null default 'GB';
alter table public.trucks add column if not exists currency text not null default 'GBP';
alter table public.trucks add column if not exists timezone text;

comment on column public.trucks.country is
  'ISO 3166-1 alpha-2, upper case. The truck''s trading country; every country-specific rule (prices, fees, tax, formats, allergen set) is read from public.country_settings by this code. Foreign key to country_settings from 20261010_05. Snapshotted onto each order as orders.country (20261010_07).';
comment on column public.trucks.currency is
  'ISO 4217, upper case (CHECK from 20261010_06). The ONE currency this truck trades in. Snapshotted onto each order as orders.currency (20261010_07) so changing it never reprices history.';
comment on column public.trucks.timezone is
  'IANA zone name, e.g. Europe/London. NULL on every truck today, and every reader falls back to Europe/London. Offered from country_settings.timezones at signup once Part B ships.';

commit;

notify pgrst, 'reload schema';
