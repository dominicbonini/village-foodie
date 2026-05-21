alter table trucks
  add column if not exists display_mode text default 'list' not null;

alter table trucks drop constraint if exists trucks_display_mode_check;
alter table trucks add constraint trucks_display_mode_check
  check (display_mode in ('list', 'grid'));
