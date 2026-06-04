-- Scraper run log — operational only, pruned to 90 days
create table if not exists scraper_run_log (
  id uuid primary key default gen_random_uuid(),
  truck_id text references trucks(id) on delete cascade,
  run_at timestamptz not null default now(),
  day_of_week smallint not null,
  events_found integer not null default 0,
  events_changed boolean not null default false,
  rule_used text,
  notes text
);

create index if not exists scraper_run_log_truck_run
  on scraper_run_log(truck_id, run_at desc);

-- Adaptive scheduling columns on trucks
alter table trucks
  add column if not exists scraper_last_changed_at timestamptz,
  add column if not exists scraper_update_day smallint,
  add column if not exists scraper_learning_complete boolean not null default false,
  add column if not exists scraper_last_empty_notify_at timestamptz,
  add column if not exists scraper_first_run_at timestamptz,
  add column if not exists scraper_last_hash text;

comment on column trucks.scraper_update_day is
  '0=Sunday..6=Saturday. Null until learning_complete. Day scraper detected operator typically updates schedule.';
comment on column trucks.scraper_learning_complete is
  'True after 30 days of daily runs. Enables adaptive scheduling.';
comment on column trucks.scraper_last_empty_notify_at is
  'Timestamp of last no-schedule nudge email sent. Guards 14-day resend limit.';

-- RLS: scraper_run_log is service-role only (no anon policy)
alter table scraper_run_log enable row level security;
