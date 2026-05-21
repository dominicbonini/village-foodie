-- Add plan, trial expiry, and per-truck feature overrides to trucks

alter table trucks
  add column if not exists plan text not null default 'starter',
  add column if not exists trial_expires_at timestamptz,
  add column if not exists feature_overrides jsonb default '{}'::jsonb;

alter table trucks
  drop constraint if exists trucks_plan_check;

alter table trucks
  add constraint trucks_plan_check
  check (plan in ('starter', 'pro', 'max', 'trial'));

-- Backfill: all existing trucks get starter
update trucks set plan = 'starter' where plan is null;

-- KDS session tracking for multi-device enforcement
-- truck_id is text to match trucks.id
create table if not exists kds_sessions (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references trucks(id) on delete cascade,
  session_token text not null unique,
  view_mode text not null check (view_mode in ('window', 'cook')),
  last_ping timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_kds_sessions_truck_id
  on kds_sessions(truck_id);

comment on column trucks.feature_overrides is
  'Per-truck feature overrides. Keys are Feature strings, values are booleans.
   Example: {"cook_screen": true, "whatsapp_replies": false}
   Overrides take precedence over plan tier. Used for trial extensions,
   custom deals, and admin grants.';
