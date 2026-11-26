-- 20261146_hatches_up_1.sql — hatches-up-1 (26 Nov 2026; docs/hatches-up-1-report.md): compare-square-1 step 4 finished with the URL
-- Dominic sent. data/hatches-up-1/competitors.json (imported) set the website and added the plan and the quoted answers; this does what
-- the importer can't:
--   1 · check_urls: its own /vendors/ and /pricing/ pages;
--   2 · the GB entry's shown plan → the new plan a8235235 (from /pricing/);
--   3 · the old "Online ordering" plan eec3fac5 (from the manual, no source) superseded — kept as history.
-- Competitor and comparison tables only. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
begin
  if (select count(*) from public.competitors where id = 'fbbf6c37-2dd0-5f11-9e68-a0be5d563629' and name = 'Hatches Up'
       and website = 'https://hatchesup.co.uk' and coalesce(cardinality(check_urls), 0) = 0) <> 1 then
    raise exception 'hatches-up-1: Hatches Up (website set by the import, no check_urls) not found as expected'; end if;
  if (select count(*) from public.competitor_plans where id = 'a8235235-b166-5552-9d0c-e757f6ba7f3e' and competitor_id = 'fbbf6c37-2dd0-5f11-9e68-a0be5d563629'
       and country_code = 'GB' and superseded_at is null and source_url = 'https://hatchesup.co.uk/pricing/') <> 1 then
    raise exception 'hatches-up-1: the imported plan a8235235 not found as expected'; end if;
  if (select count(*) from public.competitor_plans where id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67' and superseded_at is null and source_url is null) <> 1 then
    raise exception 'hatches-up-1: the old plan eec3fac5 not found as expected'; end if;
  if (select count(*) from public.comparison_entries where id = '5a839fb0-eca9-41d6-aabf-986b9b6c1000'
       and primary_plan_id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67' and verified_at is null) <> 1 then
    raise exception 'hatches-up-1: the GB entry 5a839fb0 not found as expected'; end if;
end $$;

update public.competitors
   set check_urls = array['https://hatchesup.co.uk/vendors/', 'https://hatchesup.co.uk/pricing/'],
       notes = coalesce(notes || ' · ', '') || 'hatches-up-1 (26 Nov 2026): its own site https://hatchesup.co.uk (URL from Dominic); read /vendors/ and /pricing/'
 where id = 'fbbf6c37-2dd0-5f11-9e68-a0be5d563629';

update public.comparison_entries set primary_plan_id = 'a8235235-b166-5552-9d0c-e757f6ba7f3e'
 where id = '5a839fb0-eca9-41d6-aabf-986b9b6c1000' and primary_plan_id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67';

update public.competitor_plans set superseded_at = now()
 where id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67' and superseded_at is null;

commit;
