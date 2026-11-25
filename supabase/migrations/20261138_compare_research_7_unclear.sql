-- 20261138_compare_research_7_unclear.sql — compare-research-7 review (25 November 2026; docs/compare-research-7-report.md).
-- Two vendors imported at the Block 4 load whose prices the review keeps uncounted (the conservative choice; the importer never changes a
-- plan it already has). Neither is shown on a live page (both are behind their country's food-truck tools). Competitor data only: 4
-- competitor_plans rows. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
--   · Fritzy BE "Fritzy (sans abonnement)" (0 € + a per-order fee): no subscription, close to a marketplace model.
--   · GoPOS / GoOrder PL — GoOrder Pakiet Online Basic / Pro / Unlimited (49 / 129 / 349 zł): may also need the 79 zł GoPOS licence
--     (a module on a paid plan, not confirmed on its own site).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('ea14a492-93e0-5487-9280-6a6c4e66500c', '47da0178-04f7-50a0-aba2-c36e242f7a05', 'bf7d6ec3-c1ca-5da9-bc24-92a34cb9dddf', 'f27272a8-4df2-545f-846a-fab8bd075667')
     and superseded_at is null and not unclear and auto_verified_at is null;
  if n <> 4 then raise exception 'compare-research-7: expected the 4 plans current, not unclear and not shown, found %', n; end if;
end $$;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-7 review, 25 Nov, conservative): a per-order fee with no subscription, close to a marketplace model'
 where id = 'ea14a492-93e0-5487-9280-6a6c4e66500c' and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-7 review, 25 Nov, conservative): GoOrder may also need the 79 zł GoPOS licence (module on a paid plan, not confirmed)'
 where id in ('47da0178-04f7-50a0-aba2-c36e242f7a05', 'bf7d6ec3-c1ca-5da9-bc24-92a34cb9dddf', 'f27272a8-4df2-545f-846a-fab8bd075667') and superseded_at is null and not unclear;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('ea14a492-93e0-5487-9280-6a6c4e66500c', '47da0178-04f7-50a0-aba2-c36e242f7a05', 'bf7d6ec3-c1ca-5da9-bc24-92a34cb9dddf', 'f27272a8-4df2-545f-846a-fab8bd075667') and unclear;
  if n <> 4 then raise exception 'compare-research-7: the 4 plans were not all marked unclear (%)', n; end if;
end $$;

commit;
