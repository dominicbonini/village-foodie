-- ============================================================
-- Event system V1
-- Replaces is_confirmed + is_cancelled boolean columns with
-- a single status enum. Adds open/close controls, event_id
-- linking on orders and collection_times.
-- Safe to run: truck_events table has 0 rows.
-- ============================================================

-- 1. Drop RLS policies that depend on the old boolean columns
--    (must happen before the column drop or Postgres will refuse)
drop policy if exists "Public read truck_events" on truck_events;

-- 2. Drop the old boolean columns
alter table truck_events
  drop column if exists is_confirmed,
  drop column if exists is_cancelled;

-- 2. Add status and all new columns
alter table truck_events
  add column if not exists status text not null default 'unconfirmed',
  add column if not exists auto_open boolean not null default false,
  add column if not exists auto_close boolean not null default true,
  add column if not exists opened_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists venue_address text,
  add column if not exists customer_note text;

-- 3. Status constraint
alter table truck_events
  drop constraint if exists truck_events_status_check;

alter table truck_events
  add constraint truck_events_status_check
  check (status in ('unconfirmed', 'confirmed', 'open', 'closed', 'cancelled'));

-- 4. Add event_id to orders
alter table orders
  add column if not exists event_id uuid references truck_events(id) on delete set null;

create index if not exists idx_orders_event_id
  on orders(event_id)
  where event_id is not null;

-- 5. Add event_id to collection_times
alter table collection_times
  add column if not exists event_id uuid references truck_events(id) on delete cascade;

create index if not exists idx_collection_times_event_id
  on collection_times(event_id)
  where event_id is not null;

-- 7. Recreate the public read policy using status instead of is_cancelled
create policy "Public read truck_events" on truck_events
  for select using (status <> 'cancelled');

-- 8. Indexes for common queries
create index if not exists idx_truck_events_truck_status
  on truck_events(truck_id, status, event_date);

-- Comments
comment on column truck_events.status is
  'unconfirmed = bot scraped, not yet confirmed by truck
   confirmed = truck confirmed attendance, pre-orders open (Pro/Max)
   open = actively accepting walk-up orders
   closed = no longer accepting orders
   cancelled = event will not happen';

comment on column truck_events.auto_open is
  'If true, opens automatically at start_time.
   If false, operator must tap Open button on dashboard.
   No default assumed — operator must choose at confirmation.';

comment on column truck_events.auto_close is
  'If true, closes automatically at end_time.
   Defaults true — safe default, operator can extend.';

comment on column orders.event_id is
  'FK to truck_events.id. Nullable for legacy orders.
   All new orders must set this field.';

comment on column collection_times.event_id is
  'FK to truck_events.id. Nullable for legacy rows.
   All new slot generation must set this field.';
