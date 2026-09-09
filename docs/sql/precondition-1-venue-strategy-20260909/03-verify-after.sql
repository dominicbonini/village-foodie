select coalesce(scraper_strategy, '(NULL)') as value, count(*)
from venues group by 1 order by 2 desc;
-- expect: (NULL) 807 · 'scroll_lazy' 7    — and NO marker value

-- The 7 venue sites are untouched and still carry a real strategy.
select count(*) as sites_with_a_real_strategy
from venues where schedule_url is not null and scraper_strategy = 'scroll_lazy';   -- expect 7

-- Nothing else moved.
select count(*) as total_venues from venues;   -- expect 814
