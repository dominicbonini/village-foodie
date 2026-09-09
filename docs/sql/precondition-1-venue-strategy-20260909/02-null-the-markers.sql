-- Null the marker values in `venues.scraper_strategy`.
--
-- 🔴 THE `schedule_url is null` GUARD IS NOT DECORATION. It is what makes this statement incapable of
-- changing scraper behaviour: a row with no schedule_url is not a site (run-scraper.js's venue builder
-- requires `row[9]` to start with http), so its strategy is never read. If a marker row somehow gains a
-- schedule_url between 00-verify-before and now, this statement will skip it and the count below will
-- come back < 100 — which is your signal to stop and look, not to force it.
update venues
set scraper_strategy = null
where scraper_strategy like '%NEW FROM SCRAPER%'
  and schedule_url is null;

-- expect 100 rows updated
select count(*) as remaining_markers from venues where scraper_strategy like '%NEW FROM SCRAPER%';
-- expect 0
