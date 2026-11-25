-- 20261134_compare_research_6_fudo.sql — compare-research-6 Round 1(c) (Dominic, 25 November 2026; docs/compare-research-6-report.md).
-- Fudo has no free plan, and «Solo necesitás/necesitas una cuenta activa en Fudo» means Tu Delivery needs a paid account (the V16.38
-- module rule read with "no free plan"). data/compare-research-6/competitors.json adds "Plan Inicial + Tu Delivery" for AR (ARS 23.900 a
-- month "Precio final" + 1,9 % + IVA per sale) and CL (CLP 25.500 a month sin IVA + 1,9 % + IVA), every amount quoted from that country's
-- own page. This supersedes (keeps as history) the two plans it replaces — the importer only supersedes a plan of the SAME name:
--   · AR "Tu Delivery (no monthly fee)" (ARS 0 + 1,9 %), the plan shown today;
--   · CL "Tu Delivery" (CLP 0 + 1,9 %), unclear since compare-research-4.
-- Competitor data only: 2 competitor_plans rows. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('46458e02-9565-58cc-9e95-5c2a4897d829', '7ae635e1-f7a8-5ce8-be67-060c9f1fe559')
     and competitor_id = '7e12931c-a5ee-5681-b0fd-2df360ba62c8' and superseded_at is null and monthly_minor = 0;
  if n <> 2 then raise exception 'compare-research-6: expected Fudo''s current AR and CL Tu Delivery plans (0 a month), found %', n; end if;
end $$;

update public.competitor_plans
   set superseded_at = now(),
       notes = coalesce(notes || ' · ', '') || 'superseded (compare-research-6, Dominic 25 Nov): replaced by "Plan Inicial + Tu Delivery" — Tu Delivery needs a paid Fudo account (no free plan)'
 where id in ('46458e02-9565-58cc-9e95-5c2a4897d829', '7ae635e1-f7a8-5ce8-be67-060c9f1fe559') and superseded_at is null;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans where id in ('46458e02-9565-58cc-9e95-5c2a4897d829', '7ae635e1-f7a8-5ce8-be67-060c9f1fe559') and superseded_at is not null;
  if n <> 2 then raise exception 'compare-research-6: the two Fudo plans were not both superseded (%)', n; end if;
end $$;

commit;
