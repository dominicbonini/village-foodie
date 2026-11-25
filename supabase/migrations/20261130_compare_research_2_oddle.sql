-- 20261130_compare_research_2_oddle.sql — compare-research-2 (25 November 2026; docs/compare-research-2-report.md).
-- Oddle's stored website is its RESELLER's (https://www.uob.com.sg, UOB bank's BizSmart page), so the publish rule "a quote / a price on
-- the vendor's own site" (lib/comparison-publish.ts ownSource: the website's or a check page's domain) refuses everything read today on
-- Oddle's OWN site, oddle.me (HK HK$1,250 and SG S$300 a month, the pickup-slot quote). The importer only fills an EMPTY website, so it
-- cannot correct it. This sets Oddle's website to its own domain and its check pages to the oddle.me pages the research read.
-- Competitor data only: ONE row of public.competitors (id 110abdac-c213-5f20-bada-10b1b9b8c9f0). Guarded: it changes the row only while
-- it still has the reseller's website, and raises (nothing written) on any surprise.
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitors
   where id = '110abdac-c213-5f20-bada-10b1b9b8c9f0' and name = 'Oddle' and website = 'https://www.uob.com.sg';
  if n <> 1 then raise exception 'compare-research-2: expected Oddle (110abdac…) with website https://www.uob.com.sg, found % row(s) — stop', n; end if;
end $$;

update public.competitors
   set website = 'https://oddle.me',
       check_urls = array['https://oddle.me/hk/pricing', 'https://oddle.me/sg/pricing',
                          'https://www.oddle.me/docs/new-guests/shop/setting-up-for-online-ordering/store-settings'],
       notes = coalesce(notes || ' · ', '') || 'website corrected to its own domain (compare-research-2, 25 Nov 2026): was its reseller''s, https://www.uob.com.sg'
 where id = '110abdac-c213-5f20-bada-10b1b9b8c9f0' and website = 'https://www.uob.com.sg';

do $$
declare n int;
begin
  select count(*) into n from public.competitors where id = '110abdac-c213-5f20-bada-10b1b9b8c9f0' and website = 'https://oddle.me';
  if n <> 1 then raise exception 'compare-research-2: Oddle''s website was not corrected — stop'; end if;
end $$;

commit;
