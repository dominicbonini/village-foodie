-- 20261135_compare_research_6_poster_kz.sql — compare-research-6 Round 3 (Dominic, 25 November 2026: "KZ (add joinposter.kz to Poster's
-- check pages; the own-site rule then allows Poster KZ's quotes)"; docs/compare-research-6-report.md). Competitor data only: 1 competitors
-- row and 1 competitor_plans row. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
--   · Poster (0802a7c8): joinposter.kz's pricing and food-truck pages added to its check pages, so the publish rule's own-site check
--     (website or check-page domain) accepts the prices and quotes read on joinposter.kz.
--   · Poster KZ "Poster Site (ordering website add-on)" (11 400 ₸): the add-on on its own needs a POS plan, so it is not a whole monthly
--     price — marked unclear, as in UA (compare-research-3b). KZ's countable plan stays "Starter + Poster Site add-on" (21 000 ₸ a month
--     on monthly billing, 9 600 + 11 400, both quoted).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitors
   where id = '0802a7c8-e311-5b65-af51-44972ef2749c' and name = 'Poster' and not (array_to_string(check_urls, ',') like '%joinposter.kz%');
  if n <> 1 then raise exception 'compare-research-6: expected Poster without joinposter.kz check pages, found % row(s)', n; end if;
  select count(*) into n from public.competitor_plans
   where id = '6e08b1cc-704f-52c1-b4d3-cbf67b966706' and country_code = 'KZ' and superseded_at is null and not unclear and monthly_minor = 1140000;
  if n <> 1 then raise exception 'compare-research-6: expected Poster''s KZ add-on plan current and not unclear, found %', n; end if;
end $$;

update public.competitors
   set check_urls = check_urls || array['https://joinposter.kz/pricing', 'https://joinposter.kz/business/foodtruck'],
       notes = coalesce(notes || ' · ', '') || 'check pages: joinposter.kz added (compare-research-6, Dominic 25 Nov) — its Kazakh prices and pages'
 where id = '0802a7c8-e311-5b65-af51-44972ef2749c' and not (array_to_string(check_urls, ',') like '%joinposter.kz%');

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-6): the ordering-website add-on on its own, not a whole monthly price (it needs a POS plan) — as in UA'
 where id = '6e08b1cc-704f-52c1-b4d3-cbf67b966706' and superseded_at is null and not unclear;

do $$
declare n int;
begin
  select count(*) into n from public.competitors where id = '0802a7c8-e311-5b65-af51-44972ef2749c' and array_to_string(check_urls, ',') like '%joinposter.kz/pricing%';
  if n <> 1 then raise exception 'compare-research-6: Poster''s check pages were not extended'; end if;
  select count(*) into n from public.competitor_plans where id = '6e08b1cc-704f-52c1-b4d3-cbf67b966706' and unclear;
  if n <> 1 then raise exception 'compare-research-6: the KZ add-on is not unclear'; end if;
end $$;

commit;
