-- 20261010_event_types_offline.sql
-- Event types, stage 2b: offline order protection becomes a type setting.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe. The last line reloads PostgREST — do not skip it, or
--    the three columns read as absent and every type falls back to "same as Standard".
--
-- ── 🔴 THREE COLUMNS, BECAUSE THE CONTROL HAS THREE CHOICES ───────────────────────────────────────
-- Settings › Kitchen offers offline protection as a SWITCH, then a MODE when the switch is on, then a
-- DELAY when the mode is "keep taking orders". A type is offered exactly those, so it needs exactly
-- those — one column each, mirroring the per-event override columns they resolve against:
--
--   event_types.offline_protection          ↔ truck_events.offline_protection_override          (bool)
--   event_types.offline_protection_mode     ↔ truck_events.offline_protection_mode_override     (text)
--   event_types.offline_auto_reject_mins    ↔ truck_events.offline_auto_reject_mins_override    (int)
--
-- ⚠️ NOT ONE jsonb COLUMN. The three are read separately by three different resolvers' links (the
-- switch gates the mode, the mode gates the delay), the CHECK on the mode is worth having, and the
-- per-event columns they shadow are three separate columns — so one jsonb blob would be the only
-- place in this chain that could not be constrained or queried.
--
-- ── 🔴 NULL MEANS "SAME AS STANDARD" ON ALL THREE, as on every other event_types column ───────────
-- So a type created before this migration — every type that exists — keeps resolving exactly as it
-- does today, because all three read NULL. `false` on the switch is a REAL instruction ("no offline
-- protection for this type of event") and is not the same as NULL; a NOT NULL DEFAULT could not say
-- "leave it alone", which is the state every type must start in.
--
-- ── ⚠️ THE DELAY'S RANGE IS CHECKED, THE MODE'S VOCABULARY IS CHECKED, THE SWITCH NEEDS NEITHER ───
-- The delay's CHECK is the same 5-30 `truck_vans.offline_auto_reject_mins` carries and the same range
-- `set_offline_protection` validates, so a hand-written row cannot ask for something no screen offers.
-- ⚠️ THE CHECK ALLOWS ANY INTEGER IN RANGE, NOT ONLY THE SIX THE PICKER SHOWS. That matches the van
-- column: the picker's list (5,10,15,20,25,30) is a UI affordance, and a constraint on it would 500 a
-- write rather than being a validation anyone can see.

set lock_timeout = '3s';

begin;

-- ── 1 · THE SWITCH ───────────────────────────────────────────────────────────────────────────────
alter table public.event_types
  add column if not exists offline_protection boolean;

comment on column public.event_types.offline_protection is
  'Does offline order protection apply at events of this type? NULL = same as Standard (the van''s truck_vans.auto_pause_on_offline), which is how every type reads before 20261010. true/false are explicit instructions for this type. Resolved by resolveOfflineWithType() in lib/event-types/resolve.ts as `truck_events.offline_protection_override ?? this ?? truck_vans.auto_pause_on_offline`. ⚠️ A hand change on one event always wins.';

-- ── 2 · THE MODE ─────────────────────────────────────────────────────────────────────────────────
alter table public.event_types
  add column if not exists offline_protection_mode text;

alter table public.event_types
  drop constraint if exists event_types_offline_protection_mode_check;

alter table public.event_types
  add constraint event_types_offline_protection_mode_check
  check (offline_protection_mode is null
         or offline_protection_mode in ('pause', 'no_auto_accept'));

comment on column public.event_types.offline_protection_mode is
  'What offline protection DOES at events of this type, when the switch resolves on. NULL = same as Standard (truck_vans.offline_protection_mode). ''pause'' = customers cannot order; ''no_auto_accept'' = customers can still order but nothing auto-confirms. The same two values and the same CHECK as truck_vans.offline_protection_mode and truck_events.offline_protection_mode_override, so all three resolve through one chain. ⚠️ IGNORED WHEN THE SWITCH RESOLVES OFF, exactly as the van column is.';

-- ── 3 · THE DELAY THAT ONE MODE REQUIRES ─────────────────────────────────────────────────────────
-- 🔴 THE "no_auto_accept" MODE HAS NO "OFF" FOR THIS DELAY, and lib/copy/offlineProtection.ts says
-- why: without one, an order can sit indefinitely while the customer is never told it was not
-- accepted, which is what the feature exists to prevent. So a type choosing that mode is given the
-- default by the screen, exactly as Settings › Kitchen gives a van one on the same interaction.
alter table public.event_types
  add column if not exists offline_auto_reject_mins integer;

alter table public.event_types
  drop constraint if exists event_types_offline_auto_reject_mins_check;

alter table public.event_types
  add constraint event_types_offline_auto_reject_mins_check
  check (offline_auto_reject_mins is null
         or (offline_auto_reject_mins >= 5 and offline_auto_reject_mins <= 30));

comment on column public.event_types.offline_auto_reject_mins is
  'How long an unconfirmed order may wait at events of this type before it is auto-rejected, in minutes, when the mode resolves to ''no_auto_accept''. NULL = same as Standard (truck_vans.offline_auto_reject_mins). Range 5-30, the same bounds truck_vans.offline_auto_reject_mins carries and the same range set_offline_protection validates; the picker''s six values are a UI affordance, not a constraint. ⚠️ IGNORED unless the resolved mode is ''no_auto_accept''.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the three columns read as absent (PGRST204 /
--    42703) and every type resolves offline protection as "same as Standard" on correct code.
notify pgrst, 'reload schema';
