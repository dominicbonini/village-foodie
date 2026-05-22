-- ============================================================
-- Discovery Platform Schema
-- Migrates Village Foodie discovery data from Google Sheets
-- to Supabase. Existing HatchGrab tables are untouched.
-- ============================================================

-- 1. VENUES
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  village text,
  postcode text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  owner_email text,
  phone text,
  premium boolean not null default false,
  website text,
  schedule_url text,
  ai_instructions text,
  scraper_strategy text,
  photo_url text,
  aliases text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_venues_name on venues(name);
create index if not exists idx_venues_village on venues(village);

-- 2. DISCOVERY TRUCKS
-- Separate from the operator `trucks` table.
-- These are the 100+ scraped trucks shown on the discovery map.
-- hatchgrab_truck_id links to `trucks.id` for operators who sign up.
create table if not exists discovery_trucks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuisine text,
  phone text,
  mobile text,
  order_url text,
  accepted_methods text,
  notes text,
  website text,
  menu_url text,
  schedule_url text,
  logo_url text,
  photo_url text,
  contact_email text,
  verified boolean not null default false,
  type text,
  ai_instructions text,
  scraper_strategy text,
  aliases text[] default '{}',
  is_meal boolean not null default true,
  exclude_reason text,
  hatchgrab_truck_id text references trucks(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_discovery_trucks_name on discovery_trucks(name);
create index if not exists idx_discovery_trucks_hatchgrab on discovery_trucks(hatchgrab_truck_id)
  where hatchgrab_truck_id is not null;

-- 3. DISCOVERY EVENTS
-- Raw scraped events. Separate from truck_events (confirmed HatchGrab events).
create table if not exists discovery_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  start_time text,
  end_time text,
  truck_name text not null,
  venue_name text,
  village text,
  event_notes text,
  source text,
  ai_notes text,
  discovery_truck_id uuid references discovery_trucks(id) on delete set null,
  venue_id uuid references venues(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_discovery_events_date
  on discovery_events(event_date);
create index if not exists idx_discovery_events_truck
  on discovery_events(truck_name);
create index if not exists idx_discovery_events_truck_id
  on discovery_events(discovery_truck_id)
  where discovery_truck_id is not null;

-- 4. EXCLUDED TERMS
create table if not exists excluded_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  created_at timestamptz default now()
);

-- 5. SUBSCRIBERS
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  postcode text,
  preferred_distance_miles numeric(5,1) default 20,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  village text,
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);

create index if not exists idx_subscribers_email on subscribers(email);

comment on table discovery_trucks is
  'Scraped truck profiles for the discovery map.
   Separate from the operator trucks table.
   hatchgrab_truck_id links trucks that have signed up to HatchGrab.';

comment on table discovery_events is
  'Raw scraped events for the discovery map.
   Separate from truck_events (confirmed HatchGrab operator events).
   These are populated by the scraper and Apps Script email handler.';

comment on table venues is
  'Pub and venue profiles. Used by both the discovery map
   and as event location references in truck_events.';
