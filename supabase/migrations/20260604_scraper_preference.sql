alter table trucks
  add column if not exists scraper_preference text
    check (scraper_preference in ('auto', 'manual', 'both'))
    default 'manual',
  add column if not exists schedule_url text,
  add column if not exists scraper_rule text
    check (scraper_rule in ('scroll_lazy', 'scroll_next'));

comment on column trucks.scraper_preference is
  'auto = scrape only, manual = operator uploads only, both = scrape + upload';
comment on column trucks.schedule_url is
  'URL operator provided for schedule scraping';
comment on column trucks.scraper_rule is
  'Winning scroll rule detected on first dual-run. Null = not yet determined.';
