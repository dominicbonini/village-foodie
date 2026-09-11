-- 20260912_superseded_reason_values.sql
-- Widen the superseded_reason CHECK so the two added duplicate rules can record which one fired.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor.
-- 🔴 REQUIRED BEFORE THE BACKFILL IS RUN WITH --apply. Without it, every mark whose rule is
--    'identical-coords' or 'name-time' is rejected by the constraint (SQLSTATE 23514) and counted as a
--    mark failure; the postcode and distance marks would still land, so a partial run is the failure
--    mode, not a clean stop.
--
-- WHY A DROP-AND-ADD AND NOT AN "ALTER CHECK": PostgreSQL has no in-place edit for a CHECK constraint.
-- The original was created inline by `add column ... check (...)` in 20260911_discovery_events_superseded
-- .sql, which auto-names it `<table>_<column>_check` — dropped by that name below, then re-added with the
-- same name explicitly so the next migration can find it.
--
-- THE TWO NEW VALUES:
--   identical-coords — both venues at exactly the same latitude and longitude.
--   name-time        — venue names contained either way (after the existing normaliser, 4-char floor),
--                      the same start time, and the venues within 1,500 m.
--
-- Idempotent: drop-if-exists then add; re-running is a no-op that ends in the same state.
-- ⚠️ SAFE ON EXISTING DATA: the 13 rows already marked carry 'postcode' or 'distance', both still
--    allowed, so the new constraint validates against today's table without rewriting a row.

begin;

alter table public.discovery_events
  drop constraint if exists discovery_events_superseded_reason_check;

alter table public.discovery_events
  add constraint discovery_events_superseded_reason_check
  check (superseded_reason in ('postcode', 'distance', 'identical-coords', 'name-time'));

comment on column public.discovery_events.superseded_reason is
  'Which rule judged this row a duplicate: postcode (same full postcode) | distance (<= 500 m) | identical-coords (same lat/lon) | name-time (contained venue names, same start time, <= 1500 m).';

commit;

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   select superseded_reason, count(*)
--   from public.discovery_events
--   where superseded_by is not null
--   group by superseded_reason order by 2 desc;
-- Expected immediately after applying: postcode 7, distance 6 — the 13 already marked. No new value
-- appears until the backfill is re-run with --apply.

notify pgrst, 'reload schema';
