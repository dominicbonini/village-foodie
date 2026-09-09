-- PRECONDITION 1 — `venues.scraper_strategy` holds a MARKER, not a strategy.
-- Run this first. Expect: 100 marker rows, 7 real strategies, 707 null, and 0 marker rows that are sites.

select coalesce(scraper_strategy, '(NULL)') as value, count(*)
from venues group by 1 order by 2 desc;
-- expect: (NULL) 707 · '[⚠️ NEW FROM SCRAPER]' 100 · 'scroll_lazy' 7

-- 🔴 THE SAFETY CHECK. A marker row with a schedule_url would be a SITE, and nulling its strategy
-- would change scraper behaviour. Expect 0. If this is not 0, STOP and re-read the report.
select count(*) as marker_rows_that_are_sites
from venues
where scraper_strategy like '%NEW FROM SCRAPER%' and schedule_url is not null;
-- expect 0

-- The 7 real strategies are all sites and must NOT be touched. Expect 7, all 'scroll_lazy'.
select name, village, scraper_strategy, schedule_url
from venues where scraper_strategy is not null and scraper_strategy not like '%NEW FROM SCRAPER%'
order by name;
