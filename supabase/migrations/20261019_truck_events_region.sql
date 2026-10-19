-- 20261019_truck_events_region.sql
-- US dress rehearsal fixes, Finding 6 (docs/us-dress-rehearsal-fixes-report.md): AN EVENT'S STATE. A US event's
-- address line reads "Pier A Park, Hoboken, NJ 07030" only when the event carries its state, and until now no
-- event could (truck_events has venue_name, town, postcode, address — no state).
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--    Idempotent: `add column if not exists`, so a second run changes nothing.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN AFTER DEPLOY. The column is NULLABLE with NO DEFAULT and every existing event
--    stays NULL: nothing is backfilled, and no state is invented (not from the truck's base town, not from a guess).
--    The code tolerates the column missing: it is read by its own best-effort select (lib/event-region-read.ts) and
--    written by its own best-effort update (app/api/manage/route.ts upsert_event), so until this runs every address
--    line reads exactly as before and every save succeeds.
--    Written only by the US (zip_state) Add/Edit event form and the schedule importer's `state`. A GB event never
--    gets one.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'truck_events' and column_name = 'region';
--   -- expect one row: text, is_nullable = YES, column_default NULL

set lock_timeout = '3s';

begin;

alter table public.truck_events add column if not exists region text;
comment on column public.truck_events.region is
  'The event''s two-letter state (US) when the operator or the importer gave one; NULL otherwise. Never inferred. 20261019.';

commit;

notify pgrst, 'reload schema';
