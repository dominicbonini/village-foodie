-- 20261137_compare_research_7_funfo.sql — compare-research-7 Block 6 (25 November 2026; docs/compare-research-7-report.md).
-- funfo (JP, 24aa846b): its stored website is LINE Yahoo's business site (lycbiz.com, a partner page), not funfo's own. Its own site is
-- funfo.jp, where today's plans and the takeout page are quoted («月額費用 ￥0», «決済手数料 3.35%～»). The publish rule's own-site check
-- (website or check-page domain) therefore refused funfo.jp sources. This sets the website to funfo.jp and its check pages to the funfo.jp
-- pages read — the same fix as Oddle (20261130) and Poster KZ (20261135). Plans sourced elsewhere (lycbiz.com, saas.imitsu.jp — a
-- directory) then fail the own-site check, as they should.
-- Competitor data only: 1 competitors row. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitors
   where id = '24aa846b-a685-5a1f-a513-3e13a32e5c2b' and name = 'funfo' and website = 'https://www.lycbiz.com';
  if n <> 1 then raise exception 'compare-research-7: expected funfo with website https://www.lycbiz.com, found % row(s)', n; end if;
end $$;

update public.competitors
   set website = 'https://www.funfo.jp',
       check_urls = array['https://www.funfo.jp/index.php/priceupdate/', 'https://www.funfo.jp/index.php/takeout/', 'https://www.funfo.jp'],
       notes = coalesce(notes || ' · ', '') || 'website corrected to its own domain (compare-research-7, 25 Nov): was LINE Yahoo''s partner page https://www.lycbiz.com'
 where id = '24aa846b-a685-5a1f-a513-3e13a32e5c2b' and website = 'https://www.lycbiz.com';

do $$
declare n int;
begin
  select count(*) into n from public.competitors where id = '24aa846b-a685-5a1f-a513-3e13a32e5c2b' and website = 'https://www.funfo.jp';
  if n <> 1 then raise exception 'compare-research-7: funfo''s website was not corrected'; end if;
end $$;

commit;
