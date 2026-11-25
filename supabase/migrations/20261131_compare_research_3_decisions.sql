-- 20261131_compare_research_3_decisions.sql — compare-research-3 (Dominic's decisions on compare-research-2 §6, 25 November 2026;
-- docs/compare-research-3-report.md). Competitor data only: competitor_plans (7 rows) and competitors (1 row). Guarded: any surprise
-- raises and nothing is written. Pre-flighted first with scripts/compare-db-proofs.cjs --preflight (rolled back).
--
-- d) Klikit's stored "Core" plans in SG, MY and TH have no webshop (online ordering needs the Omni add-on): marked unclear, so the
--    publish step never uses them as Klikit's price (the shown entries already point at "Core + Omni").
-- e) OlaClick: its prices are on pricing.olaclick.app (its stored website), but its order-ahead quotes are on help.olaclick.com, which
--    the own-site rule (website or check pages) did not cover — so EC could not count it. Its check pages become the pricing page and
--    the two help pages the research quoted.
-- b) Yabie SE: its priced plan "Yabie Express" (fr. 899 kr/månad) is not shown to include online ordering (Express's own list has none;
--    Yabie Online is never tied to it — docs/compare-research-3/agent-1/raw/SE-yabie.json): marked unclear.
-- c) Poster UA: the page shows "1 530 ₴1 700 ₴/міс." under an "Оплата за рік" toggle with no billing label, so the true monthly
--    price cannot be stated exactly (docs/compare-research-3/agent-1/raw/UA-poster.json): its three UA prices, all read from that page,
--    are marked unclear.
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('9a06c0dc-bc02-5c1c-8531-eb7be9323f2f', 'e83aadd1-7118-4c11-baa7-0f4e6d6efe9a', '40116351-131d-4849-8d31-18bd499e6881')
     and competitor_id = 'f44927e4-dd05-54cd-9db9-42a606810529' and plan_name = 'Core' and superseded_at is null and not unclear
     and auto_verified_at is null;
  if n <> 3 then raise exception 'compare-research-3: expected Klikit''s 3 current, unmarked, not-unclear Core plans (SG, MY, TH), found %', n; end if;
  select count(*) into n from public.competitors
   where id = 'c400f63a-23a8-51a4-882c-7a0d56c0e252' and name = 'OlaClick' and website = 'https://pricing.olaclick.app'
     and check_urls = array['https://pricing.olaclick.app'];
  if n <> 1 then raise exception 'compare-research-3: expected OlaClick (c400f63a…) with website and check pages https://pricing.olaclick.app, found % row(s)', n; end if;
  select count(*) into n from public.competitor_plans
   where id in ('dd9645c0-a3ec-54e4-9594-7d53f12ee788', 'b9749f64-bab3-5cc5-b5be-5c036aeb3740', '060fd7dd-0c18-5ddc-9198-b3340b9a9c1f', 'acd6f646-d6c6-51f5-b1c6-587bed679cab')
     and superseded_at is null and not unclear;
  if n <> 4 then raise exception 'compare-research-3: expected Yabie Express SE and Poster''s 3 UA plans current and not unclear, found %', n; end if;
end $$;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-3, Dominic 25 Nov): the plan is not shown to include online ordering (Yabie Online is a separate product)'
 where id = 'dd9645c0-a3ec-54e4-9594-7d53f12ee788' and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-3, Dominic 25 Nov): shown under an unlabelled yearly toggle ("1 530 ₴1 700 ₴/міс.", "Оплата за рік"), so the true monthly price cannot be stated exactly'
 where id in ('b9749f64-bab3-5cc5-b5be-5c036aeb3740', '060fd7dd-0c18-5ddc-9198-b3340b9a9c1f', 'acd6f646-d6c6-51f5-b1c6-587bed679cab') and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-3, Dominic 25 Nov): Core alone has no webshop — online ordering needs the Omni add-on'
 where id in ('9a06c0dc-bc02-5c1c-8531-eb7be9323f2f', 'e83aadd1-7118-4c11-baa7-0f4e6d6efe9a', '40116351-131d-4849-8d31-18bd499e6881')
   and plan_name = 'Core' and superseded_at is null and not unclear;

update public.competitors
   set check_urls = array['https://pricing.olaclick.app', 'https://pricing.olaclick.app/es',
                          'https://help.olaclick.com/es/help/cuales-son-los-tipos-de-servicio-de-olaclick',
                          'https://help.olaclick.com/es/help/c%C3%B3mo-configurar-la-p%C3%A1gina-de-ajustes-de-pedidos-en-mi-men%C3%BA-digital'],
       notes = coalesce(notes || ' · ', '') || 'check pages: its pricing page and the help pages with its order-ahead quotes (compare-research-3, Dominic 25 Nov)'
 where id = 'c400f63a-23a8-51a4-882c-7a0d56c0e252' and check_urls = array['https://pricing.olaclick.app'];

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('9a06c0dc-bc02-5c1c-8531-eb7be9323f2f', 'e83aadd1-7118-4c11-baa7-0f4e6d6efe9a', '40116351-131d-4849-8d31-18bd499e6881') and unclear;
  if n <> 3 then raise exception 'compare-research-3: Klikit''s Core plans were not all marked unclear (%)', n; end if;
  select count(*) into n from public.competitor_plans
   where id in ('dd9645c0-a3ec-54e4-9594-7d53f12ee788', 'b9749f64-bab3-5cc5-b5be-5c036aeb3740', '060fd7dd-0c18-5ddc-9198-b3340b9a9c1f', 'acd6f646-d6c6-51f5-b1c6-587bed679cab') and unclear;
  if n <> 4 then raise exception 'compare-research-3: Yabie / Poster plans were not all marked unclear (%)', n; end if;
  select count(*) into n from public.competitors where id = 'c400f63a-23a8-51a4-882c-7a0d56c0e252' and array_length(check_urls, 1) = 4;
  if n <> 1 then raise exception 'compare-research-3: OlaClick''s check pages were not set'; end if;
end $$;

commit;
