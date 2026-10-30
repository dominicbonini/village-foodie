-- supabase/migrations/20261051_competitor_check_7.sql — competitor-check-7 (30 October 2026, docs/competitor-check-7-report.md).
-- ⛔ NOT RUN — Dominic runs it. Until it runs, the checker writes 'unclear' as 'not_run' (store-supabase.ts insertFindings),
-- never as 'disagreed'.
--
-- competitor_check_findings.second_check gains 'unclear': the second check ran but could not confirm — no value or no quote,
-- the value not found, the page not readable, or its own quote not on its page. Admin shows it as "Couldn't confirm".
-- 'disagreed' is now only a DIFFERENT value given with its own quote, found on the page the verifier fetched.
-- The CHECK was declared inline in 20261043 (Postgres names it competitor_check_findings_second_check_check); every CHECK on
-- the table that mentions second_check is dropped by its real name first, whatever it is.

begin;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.competitor_check_findings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%second_check%'
  loop
    execute format('alter table public.competitor_check_findings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.competitor_check_findings add constraint competitor_check_findings_second_check_check
  check (second_check in ('confirmed', 'disagreed', 'unclear', 'not_run'));

commit;

-- Check:
--   select second_check, count(*) from public.competitor_check_findings group by 1 order by 1;
