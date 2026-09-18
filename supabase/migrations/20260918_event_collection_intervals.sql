-- 20260918_event_collection_intervals.sql
-- Per-EVENT collection-interval overrides, so a change made on the dashboard applies to that event only.
--
-- ── THE THREE LAYERS, AND WHERE THIS ONE SITS ───────────────────────────────────────────────────────
--   trucks.collection_interval_mins            legacy. The CUSTOMER value for an event whose van cannot
--                                              be resolved, and its "0 ⇒ use collection_times" contract.
--                                              No longer editable.
--   truck_vans.collection_interval_mins        the van's CUSTOMER value (NOT NULL default 5)
--   truck_vans.operator_collection_interval_mins  the van's operator override (NULL ⇒ same as customers)
--   truck_events.*_override                    ← THIS FILE. The event's own pair, set on the dashboard.
--
-- ── 🔴 THE CUSTOMER COLUMN IS THE SWITCH. READ THIS BEFORE CHANGING EITHER. ──────────────────────────
-- An event HAS an override IF AND ONLY IF collection_interval_mins_override IS NOT NULL.
--   • NULL      ⇒ the event follows its van entirely, exactly as before this migration.
--   • NOT NULL  ⇒ the event's pair is fully its own:
--                   customer = collection_interval_mins_override
--                   truck    = operator_collection_interval_mins_override ?? collection_interval_mins_override
--                 and the van's values are IGNORED for that event. Not merged, not consulted.
--
-- 🔴 AN OPERATOR OVERRIDE WITH A NULL CUSTOMER OVERRIDE IS INVALID and is rejected by the save route
-- with a visible error. It is not merely useless — it is ambiguous, because there is no defensible
-- answer to "which customer grid does this event use". The pair is set together or not at all.
-- ⚠️ THERE IS DELIBERATELY NO DATABASE CONSTRAINT FOR THAT RULE. A CHECK across the two columns would
-- also fire on the bulk clear below (which writes both to NULL and is therefore fine) and on any future
-- partial write, turning an operator-facing validation error into a 23514 nobody can read. The rule
-- lives in the route, where it can say something useful; the CHECKs here police the VOCABULARY only.
--
-- ── 🔴 A SELECTION SETTING, NOT A CAPACITY ONE ──────────────────────────────────────────────────────
-- The engine (§31: projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot) reads
-- prep_secs, batch_size, kitchen_capacity and capacity_window_mins. It reads NONE of these columns.
--
-- ── WHAT THIS CHANGES FOR A LIVE TRUCK: NOTHING ─────────────────────────────────────────────────────
-- Both columns are NULL on every existing row and have NO DEFAULT, so every event keeps following its
-- van until an operator changes something on the dashboard. Pizzeria Gusto's events are unaffected.
--
-- ── THE NAMED-SELECT RULE (hardening report, manual item 7) ─────────────────────────────────────────
-- ⚠️ NEITHER COLUMN MAY BE ADDED TO /api/dashboard's truck_events SELECT. That select is NAMED, and its
-- own comment records that one absent column returns 42703 and fails the whole statement onto "the
-- silent-empty-board path". They are read by readEventIntervals, a separate capability-probed query.

set lock_timeout = '3s';

begin;

alter table public.truck_events
  add column if not exists collection_interval_mins_override integer;

alter table public.truck_events
  drop constraint if exists truck_events_collection_interval_mins_override_check;
alter table public.truck_events
  add constraint truck_events_collection_interval_mins_override_check
  check (collection_interval_mins_override is null
         or collection_interval_mins_override in (5, 10, 15, 20, 30));

alter table public.truck_events
  add column if not exists operator_collection_interval_mins_override integer;

alter table public.truck_events
  drop constraint if exists truck_events_operator_collection_interval_mins_override_check;
alter table public.truck_events
  add constraint truck_events_operator_collection_interval_mins_override_check
  check (operator_collection_interval_mins_override is null
         or operator_collection_interval_mins_override in (5, 10, 15, 20, 30));

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND BOTH COLUMNS READ AS ABSENT (PGRST204).
-- readEventIntervals degrades to "no event override" in that case, so every event follows its van and
-- the dashboard box says the setting is unavailable — but no setting would take effect.
notify pgrst, 'reload schema';
