-- Exact pre-image for the rollback: the id + old value of every row 02 will change.
create table if not exists venues_strategy_backup_20260909 as
select id, name, village, scraper_strategy
from venues
where scraper_strategy like '%NEW FROM SCRAPER%';

select count(*) as backed_up from venues_strategy_backup_20260909;   -- expect 100
