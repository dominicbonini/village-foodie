-- 20261132_compare_research_3_unclear.sql — compare-research-3 review (25 November 2026; docs/compare-research-3-report.md).
-- Two plans the wave-2 import wrote as counted, which the coordinator review marks unclear (the importer never changes a plan it already
-- has, so the rebuilt data file cannot correct them). Competitor data only: 2 competitor_plans rows. Guarded; pre-flighted rolled back.
--   · Fudo CO "Plan Inicial (base plan)" 62.900 COP: the base till plan — online ordering (Tu Delivery) is a separately priced add-on.
--   · Resto ZA "Shop" R1000: the price came from the page reader's summary, not a verbatim quote.
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('fa700135-7d88-5239-a4f3-5d0e965454d4', 'a83cd6f5-4a94-5e89-b740-d27882ec379d') and superseded_at is null and not unclear;
  if n <> 2 then raise exception 'compare-research-3: expected the 2 plans current and not unclear, found %', n; end if;
end $$;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-3 review, 25 Nov): the base till plan; online ordering is a separately priced add-on'
 where id = 'fa700135-7d88-5239-a4f3-5d0e965454d4' and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-3 review, 25 Nov): the price is not a verbatim quote from its page'
 where id = 'a83cd6f5-4a94-5e89-b740-d27882ec379d' and superseded_at is null and not unclear;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans where id in ('fa700135-7d88-5239-a4f3-5d0e965454d4', 'a83cd6f5-4a94-5e89-b740-d27882ec379d') and unclear;
  if n <> 2 then raise exception 'compare-research-3: the 2 plans were not both marked unclear (%)', n; end if;
end $$;

commit;
