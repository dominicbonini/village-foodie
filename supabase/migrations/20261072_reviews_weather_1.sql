-- supabase/migrations/20261072_reviews_weather_1.sql — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md).
-- GOOGLE REVIEW REQUESTS AND WEATHER PER STOP: THE DATA ONLY, EVERYTHING SWITCHED OFF.
--   • platform_switches       — one row; review_requests_enabled and weather_enabled, both FALSE. Nothing sends and nothing is
--                               fetched until Dominic sets one true.
--   • truck_review_settings   — per truck: review_requests_enabled (false), google_review_url, review_request_delay_minutes (60).
--                               A table of its own, not columns on trucks, so no existing `select('*')` of a truck carries it.
--   • review_requests         — one per order at most; the customer is a salted hash (sha256 of truck id + email), never the
--                               address; the unsubscribe token is per email.
--   • review_request_optouts  — per truck and email hash.
--   • weather_hourly          — the forecast cache, per provider, rounded location (0.01°) and hour (or day).
--   • event_weather           — the summary for a stop's time window.
-- Every table: RLS on, no policy, nothing granted to anon or authenticated (service role only). No row of any existing table is
-- written; only the one switches row is inserted.

begin;

create table if not exists public.platform_switches (
  id                       boolean primary key default true check (id),
  review_requests_enabled  boolean not null default false,
  weather_enabled          boolean not null default false,
  updated_at               timestamptz not null default now(),
  updated_by               text
);
insert into public.platform_switches (id) values (true) on conflict (id) do nothing;

create table if not exists public.truck_review_settings (
  truck_id                      text primary key references public.trucks(id) on delete cascade,
  review_requests_enabled       boolean not null default false,
  google_review_url             text check (google_review_url is null or (google_review_url ~ '^https://' and length(google_review_url) <= 500)),
  review_request_delay_minutes  integer not null default 60 check (review_request_delay_minutes between 0 and 10080),
  updated_at                    timestamptz not null default now(),
  updated_by                    text
);

create table if not exists public.review_requests (
  id                 uuid primary key default gen_random_uuid(),
  truck_id           text not null references public.trucks(id) on delete cascade,
  order_id           text not null references public.orders(id) on delete cascade,
  email_hash         text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  locale             text not null,
  completed_at       timestamptz not null,
  completion_signal  text not null check (completion_signal in ('collected', 'event_closed')),
  due_at             timestamptz not null,
  status             text not null default 'scheduled' check (status in ('scheduled', 'sent', 'skipped', 'failed')),
  skip_reason        text,
  attempts           smallint not null default 0,
  sent_at            timestamptz,
  unsubscribe_token  text not null check (unsubscribe_token ~ '^[A-Za-z0-9_-]{32}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint review_requests_one_per_order_uq unique (order_id),
  constraint review_requests_token_uq unique (unsubscribe_token)
);
create index if not exists review_requests_due_idx on public.review_requests (status, due_at);
create index if not exists review_requests_customer_idx on public.review_requests (truck_id, email_hash, due_at);

create table if not exists public.review_request_optouts (
  truck_id    text not null references public.trucks(id) on delete cascade,
  email_hash  text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  source      text not null default 'link' check (source in ('link', 'one_click', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (truck_id, email_hash)
);

create table if not exists public.weather_hourly (
  provider          text not null,
  lat               numeric(6,2) not null,
  lng               numeric(6,2) not null,
  kind              text not null check (kind in ('hour', 'day')),
  time_utc          timestamptz not null,
  temperature_c     numeric(5,1),
  temp_min_c        numeric(5,1),
  temp_max_c        numeric(5,1),
  precip_chance     smallint check (precip_chance is null or precip_chance between 0 and 100),
  wind_kph          numeric(5,1),
  icon              text,
  fetched_at        timestamptz not null,
  primary key (provider, lat, lng, kind, time_utc)
);
create index if not exists weather_hourly_location_idx on public.weather_hourly (provider, lat, lng, fetched_at);

create table if not exists public.event_weather (
  event_id           uuid primary key references public.truck_events(id) on delete cascade,
  truck_id           text not null references public.trucks(id) on delete cascade,
  provider           text,
  status             text not null check (status in ('ok', 'stale', 'unavailable', 'no_location', 'too_far')),
  resolution         text check (resolution is null or resolution in ('hour', 'day')),
  lat                numeric(6,2),
  lng                numeric(6,2),
  window_start       timestamptz,
  window_end         timestamptz,
  temp_min_c         numeric(5,1),
  temp_max_c         numeric(5,1),
  precip_chance_max  smallint,
  wind_kph_max       numeric(5,1),
  icon               text,
  hours              jsonb not null default '[]'::jsonb,
  fetched_at         timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists event_weather_truck_idx on public.event_weather (truck_id);

alter table public.platform_switches enable row level security;
alter table public.truck_review_settings enable row level security;
alter table public.review_requests enable row level security;
alter table public.review_request_optouts enable row level security;
alter table public.weather_hourly enable row level security;
alter table public.event_weather enable row level security;
revoke all on public.platform_switches, public.truck_review_settings, public.review_requests, public.review_request_optouts,
  public.weather_hourly, public.event_weather from anon, authenticated;

comment on table public.platform_switches is 'reviews-weather-1: global switches, one row. Both false until Dominic turns one on.';
comment on table public.truck_review_settings is 'reviews-weather-1: per-truck Google review request settings. Service role only.';
comment on table public.review_requests is 'reviews-weather-1: one review email per order at most; the customer is a salted hash, never the address.';
comment on table public.review_request_optouts is 'reviews-weather-1: customers who unsubscribed from a truck''s review emails (salted hash).';
comment on table public.weather_hourly is 'reviews-weather-1: forecast cache per provider, location (0.01°) and hour or day.';
comment on table public.event_weather is 'reviews-weather-1: the forecast summary for a stop''s time window.';

commit;

-- Verify (read-only):
--   select * from platform_switches;
--   select relname, relrowsecurity from pg_class where relname in ('platform_switches','truck_review_settings','review_requests',
--     'review_request_optouts','weather_hourly','event_weather') and relkind = 'r' order by 1;
