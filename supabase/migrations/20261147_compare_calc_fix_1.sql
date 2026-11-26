-- 20261147_compare_calc_fix_1.sql — compare-calc-fix-1 (Dominic, 26 Nov 2026; docs/compare-calc-fix-1-report.md). Competitor plans only:
--   1 · What The Truck GB's shown plan 8c777139: its 3.95% online fee stored as the card-fee-included rate (card_mode bundled, card_bps 395,
--       card_fixed_minor 0, truck_fee_bps 0) — before, the 3.95% was a per-order fee with no card rate, so the cost model added Stripe's
--       rate on top (£74.50 instead of £39.50 on £1,000); and «+ VAT» in its plan NAME (the page shows the name beside the price, never
--       the note): "What The Truck (online fee + VAT)" — its own page: «The platform fee for online ordering is subject to VAT at 20%.»
--   2 · Favrit NO 3cc7270e and WEIQ SE 89278321: card_mode 'unknown' — each own price page read once (web.favrit.com/pris,
--       weiq.tech/pris/) states no card rate for that plan, so "bundled" with no rate is not supported.
-- PROOF (inside the transaction): an md5 of every competitor_plans row with the five named columns removed is the same before and after,
-- and an md5 of every OTHER row, whole, is the same — so only those columns of these three rows change.
-- Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
begin
  if (select count(*) from public.competitor_plans where id = '8c777139-ad56-5b20-93c1-b9f44dc8bb1c' and plan_name = 'What The Truck' and country_code = 'GB'
       and card_mode = 'bundled' and card_bps is null and card_fixed_minor is null and truck_fee_bps = 395 and superseded_at is null and verified_at is null) <> 1 then
    raise exception 'compare-calc-fix-1: What The Truck''s plan 8c777139 not found as expected'; end if;
  if (select count(*) from public.competitor_plans where id in ('3cc7270e-848f-5b6d-920b-a89a57001c7f', '89278321-a389-5950-bc09-ae8f12036876')
       and card_mode = 'bundled' and card_bps is null and superseded_at is null and verified_at is null) <> 2 then
    raise exception 'compare-calc-fix-1: the Favrit / WEIQ plans not found as expected'; end if;
  if exists (select 1 from public.competitor_plans where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93' and country_code = 'GB'
       and lower(plan_name) = lower('What The Truck (online fee + VAT)')) then
    raise exception 'compare-calc-fix-1: a plan named "What The Truck (online fee + VAT)" already exists'; end if;
end $$;

create temporary table ccf1_before as
select (select md5(string_agg((to_jsonb(p) - 'card_mode' - 'card_bps' - 'card_fixed_minor' - 'truck_fee_bps' - 'plan_name')::text, '|' order by p.id)) from public.competitor_plans p) as stripped,
       (select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) from public.competitor_plans p
         where p.id not in ('8c777139-ad56-5b20-93c1-b9f44dc8bb1c', '3cc7270e-848f-5b6d-920b-a89a57001c7f', '89278321-a389-5950-bc09-ae8f12036876')) as others,
       (select count(*) from public.competitor_plans) as n;

update public.competitor_plans
   set card_mode = 'bundled', card_bps = 395, card_fixed_minor = 0, truck_fee_bps = 0, plan_name = 'What The Truck (online fee + VAT)'
 where id = '8c777139-ad56-5b20-93c1-b9f44dc8bb1c' and truck_fee_bps = 395 and card_bps is null;

update public.competitor_plans set card_mode = 'unknown'
 where id in ('3cc7270e-848f-5b6d-920b-a89a57001c7f', '89278321-a389-5950-bc09-ae8f12036876') and card_mode = 'bundled' and card_bps is null;

do $$
declare b record;
begin
  select * into b from ccf1_before;
  if (select count(*) from public.competitor_plans) <> b.n then raise exception 'compare-calc-fix-1: the plan count changed'; end if;
  if (select md5(string_agg((to_jsonb(p) - 'card_mode' - 'card_bps' - 'card_fixed_minor' - 'truck_fee_bps' - 'plan_name')::text, '|' order by p.id)) from public.competitor_plans p) <> b.stripped then
    raise exception 'compare-calc-fix-1: a column other than the five named ones changed'; end if;
  if (select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) from public.competitor_plans p
       where p.id not in ('8c777139-ad56-5b20-93c1-b9f44dc8bb1c', '3cc7270e-848f-5b6d-920b-a89a57001c7f', '89278321-a389-5950-bc09-ae8f12036876')) <> b.others then
    raise exception 'compare-calc-fix-1: a plan other than the three changed'; end if;
  if (select count(*) from public.competitor_plans where id = '8c777139-ad56-5b20-93c1-b9f44dc8bb1c' and card_mode = 'bundled' and card_bps = 395
       and card_fixed_minor = 0 and truck_fee_bps = 0 and plan_name = 'What The Truck (online fee + VAT)') <> 1 then
    raise exception 'compare-calc-fix-1: What The Truck''s plan not as intended'; end if;
  if (select count(*) from public.competitor_plans where id in ('3cc7270e-848f-5b6d-920b-a89a57001c7f', '89278321-a389-5950-bc09-ae8f12036876') and card_mode = 'unknown') <> 2 then
    raise exception 'compare-calc-fix-1: Favrit / WEIQ not as intended'; end if;
  raise notice 'compare-calc-fix-1: md5 proof passed — stripped %, others %', b.stripped, b.others;
end $$;

drop table ccf1_before;

commit;
