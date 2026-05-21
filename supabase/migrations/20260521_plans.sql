-- Plan tier on trucks
alter table trucks
  add column if not exists plan text not null default 'starter';

alter table trucks
  drop constraint if exists trucks_plan_check;

alter table trucks
  add constraint trucks_plan_check
  check (plan in ('starter', 'pro', 'max'));

-- Backfill: all existing trucks get starter plan
update trucks set plan = 'starter' where plan is null;

-- KDS session tracking for device management
create table if not exists kds_sessions (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references trucks(id) on delete cascade,
  session_token text null unique,
  view_mode text not null check (view_mode in ('window', 'cook')),
  last_ping timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Index for fast lookup of active sessions per truck
create index if not exists idx_kds_sessions_truck_id
  on kds_sessions(truck_id);

-- Sessions older than 5 minutes are considered dead
-- (enforced in application logic, not DB)
