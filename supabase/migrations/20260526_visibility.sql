-- Add visibility control to discovery_trucks and discovery_events.
-- Run this in the Supabase SQL editor BEFORE deploying the visibility filter code.
-- All existing rows receive visibility = 'public' by default.

alter table discovery_trucks
  add column if not exists visibility text
    not null default 'public'
    check (visibility in ('public', 'hg_only', 'hidden'));

alter table discovery_events
  add column if not exists visibility text
    not null default 'public'
    check (visibility in ('public', 'hg_only', 'hidden'));

comment on column discovery_trucks.visibility is
  'public: appears on both VF and HG.
   hg_only: appears on HG only (for live testing of HG-specific trucks).
   hidden: appears nowhere (test/excluded content).';

comment on column discovery_events.visibility is
  'Mirrors discovery_trucks.visibility by default.
   Can be overridden per-event.
   public: both sites. hg_only: HG only. hidden: neither.';
