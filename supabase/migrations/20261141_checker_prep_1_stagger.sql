-- 20261141_checker_prep_1_stagger.sql — checker-prep-1 Part 2b (Dominic said yes, 25 November 2026; docs/checker-prep-1-report.md,
-- docs/compare-research-6-report.md §6.3). Database only, inert while the workflow is disabled. Columns of public.competitors only:
-- check_requested_at (cleared on every competitor) and next_check_at (set for every ACTIVE competitor with a counted plan).
--   · counted plan = current, status counted, a price, not unclear, not Admin-verified, of an active competitor with an entry in that
--     country (Admin-verified plans never expire, so they don't set the order);
--   · order = the competitor's earliest counted plan's expiry (checked_on + its interval, 90 by default, + 30 days);
--   · 4 a day from 4 January 2027; every competitor must fall due at least 14 days before that expiry, or this raises and nothing is
--     written (then the number a day is raised — see the report);
--   · competitors without counted plans keep their next_check_at (spreadFirstDates in lib/competitor-check/core.ts handles nulls).
-- Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight-checker (rolled back).
begin;

create temporary table checker_prep_1_plan as
with counted as (
  select p.competitor_id, min(p.checked_on + (coalesce(c.check_interval_days, 90) + 30)) first_expiry
  from public.competitor_plans p join public.competitors c on c.id = p.competitor_id
  where p.superseded_at is null and p.status = 'counted' and not p.price_hidden and p.monthly_minor is not null and not p.unclear
    and p.verified_at is null and c.lifecycle = 'active'
    and exists (select 1 from public.comparison_entries e where e.competitor_id = p.competitor_id and e.country_code = p.country_code)
  group by p.competitor_id),
ranked as (select competitor_id, first_expiry, row_number() over (order by first_expiry, competitor_id) - 1 rk from counted)
select competitor_id, first_expiry, (date '2027-01-04' + (rk / 4)::int) due from ranked;

do $$
declare n int; late int; margin int;
begin
  select count(*), count(*) filter (where due > first_expiry - 14), min(first_expiry - due) into n, late, margin from checker_prep_1_plan;
  if n < 100 then raise exception 'checker-prep-1: only % competitors with counted plans — stop', n; end if;
  if late > 0 then raise exception 'checker-prep-1: % competitors would fall due less than 14 days before their first expiry at 4 a day — stop', late; end if;
  raise notice 'checker-prep-1: % competitors staggered, smallest margin % days', n, margin;
end $$;

update public.competitors set check_requested_at = null where check_requested_at is not null;

update public.competitors c set next_check_at = s.due
  from checker_prep_1_plan s where c.id = s.competitor_id;

do $$
declare n int; r int;
begin
  select count(*) into r from public.competitors where check_requested_at is not null;
  if r <> 0 then raise exception 'checker-prep-1: % competitors still carry a check request', r; end if;
  select count(*) into n from public.competitors c join checker_prep_1_plan s on s.competitor_id = c.id where c.next_check_at = s.due;
  if n <> (select count(*) from checker_prep_1_plan) then raise exception 'checker-prep-1: the stagger was not fully written'; end if;
end $$;

drop table checker_prep_1_plan;

commit;
