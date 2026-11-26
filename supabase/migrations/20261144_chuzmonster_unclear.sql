-- 20261144_chuzmonster_unclear.sql — checker-cadence-1 Part 1b (Dominic, 26 November 2026; docs/foodtruck-audit-1-report.md,
-- docs/plan-names-1-report.md B.5). どこでも注文くん (Chuzmonster) JP "Takeout" (¥10,000): its price came from a third-party article
-- (lme.jp), not the vendor's own site. Its own page (https://order.yapp.li/takeout, read once on 26 Nov) says only
-- «Takeoutは固定料金なので、モバイルオーダーの売上が増えても料金は一切変わりません。» — a fixed fee, no amount. So the plan is marked unclear.
-- Competitor data only: ONE competitor_plans row (unclear + a note). Guarded; pre-flighted with
-- scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id = '5050d0c5-71e0-586a-8486-1c6c7ef69569' and superseded_at is null and not unclear and plan_name = 'Takeout' and monthly_minor = 10000;
  if n <> 1 then raise exception 'checker-cadence-1: expected Chuzmonster''s current Takeout plan (¥10,000, not unclear), found %', n; end if;
end $$;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (checker-cadence-1, 26 Nov): the ¥10,000 is from a third-party article (lme.jp); the vendor''s own page https://order.yapp.li/takeout states only «Takeoutは固定料金» with no amount'
 where id = '5050d0c5-71e0-586a-8486-1c6c7ef69569' and superseded_at is null and not unclear;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans where id = '5050d0c5-71e0-586a-8486-1c6c7ef69569' and unclear;
  if n <> 1 then raise exception 'checker-cadence-1: the plan was not marked unclear'; end if;
end $$;

commit;
