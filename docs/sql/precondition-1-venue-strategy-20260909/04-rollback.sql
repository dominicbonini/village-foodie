-- Restores every value 02 nulled, from the snapshot. Exact.
update venues v
set scraper_strategy = b.scraper_strategy
from venues_strategy_backup_20260909 b
where b.id = v.id and v.scraper_strategy is null;

select count(*) as restored from venues where scraper_strategy like '%NEW FROM SCRAPER%';   -- expect 100
-- drop table if exists venues_strategy_backup_20260909;
