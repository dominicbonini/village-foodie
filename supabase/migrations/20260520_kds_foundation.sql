-- KDS foundation: add timestamps for paid/collected, cooking status, and crew mode settings

-- Add paid_at and collected_at to orders
alter table orders
  add column if not exists paid_at timestamptz,
  add column if not exists collected_at timestamptz;

-- Update orders.status constraint to include cooking and ready
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in (
    'pending',
    'confirmed',
    'rejected',
    'modified',
    'cancelled',
    'cooking',
    'ready',
    'collected'
  ));

-- Backfill paid_at and collected_at for existing collected orders
-- (use updated_at as best-available approximation)
update orders
  set paid_at = updated_at,
      collected_at = updated_at
  where status = 'collected'
    and paid_at is null;

-- Add KDS settings to trucks
alter table trucks
  add column if not exists kds_mode boolean default false not null,
  add column if not exists crew_mode text default 'solo' not null;

-- Constrain crew_mode to valid values
alter table trucks drop constraint if exists trucks_crew_mode_check;
alter table trucks add constraint trucks_crew_mode_check
  check (crew_mode in ('solo', 'full'));

-- Index to help the dashboard query active orders quickly
create index if not exists idx_orders_truck_status_created
  on orders (truck_id, status, created_at desc);
