alter table truck_events
  add column if not exists offline_protection_override boolean default null;

comment on column truck_events.offline_protection_override is
  'Per-event override for offline protection. null = use van default (auto_pause_on_offline). true/false = explicit override set from dashboard.';
