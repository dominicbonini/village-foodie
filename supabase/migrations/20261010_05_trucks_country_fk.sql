-- 20261010_05_trucks_country_fk.sql
-- Country settings, Part A, file 5 of 9: a truck must be in a country that has a settings row.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Guarded, so re-running is safe.
--
-- ✅ CLASSIFICATION: SAFE TO RUN NOW — AFTER 20261010_03 (the GB row). All 14 trucks are 'GB' and the
--    column default is 'GB', so every existing row and every truck the current code creates
--    (lib/provision-truck.ts sends no country and takes the default) already satisfies it.
--    ⚠️ Run it BEFORE 03 and the VALIDATE fails with 23503 and the whole file rolls back — nothing is
--    left half-applied.
--
-- NOT VALID first, then VALIDATE: adding the constraint takes only a brief lock and the full scan
-- happens under VALIDATE's lighter SHARE UPDATE EXCLUSIVE lock, so trucks stays writable.
-- ON DELETE RESTRICT: a country row cannot be deleted while a truck still trades there.
--
-- VERIFY AFTER APPLYING:
--   select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'trucks_country_fkey';   -- expect convalidated = t

set lock_timeout = '3s';

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trucks'::regclass and conname = 'trucks_country_fkey'
  ) then
    alter table public.trucks
      add constraint trucks_country_fkey
      foreign key (country) references public.country_settings (country_code)
      on update restrict on delete restrict
      not valid;
  end if;
end $$;

-- A no-op when the constraint is already validated, so this line is safe on a re-run.
alter table public.trucks validate constraint trucks_country_fkey;

commit;
