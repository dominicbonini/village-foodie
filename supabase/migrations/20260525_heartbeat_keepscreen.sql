-- Heartbeat + keep-screen-on columns

alter table truck_vans
  add column if not exists paused_until timestamptz,
  add column if not exists online_paused_until timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists auto_pause_on_offline boolean not null default false;

create index if not exists idx_truck_vans_heartbeat
  on truck_vans(last_heartbeat_at)
  where auto_pause_on_offline = true;

alter table trucks
  add column if not exists keep_screen_on boolean not null default true;
