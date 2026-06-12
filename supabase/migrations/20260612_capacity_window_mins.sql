-- Kitchen-capacity ceiling gets its OWN window cadence, independent of any cooking category's prep.
-- kitchen_capacity is a CONCURRENCY ceiling ("N counted items in production at once"); this column
-- is the width (minutes) of the window the ceiling is measured over and the cadence instant counted
-- items seat/roll on. NOT NULL DEFAULT 5 so every existing van keeps today's implied 5-min behaviour
-- and the ceiling always has a cadence (closes the "no cooking category → no window" collapse).
-- Range 1–20 enforced at the DB. Read-time only — no writer/booking change.
ALTER TABLE truck_vans
  ADD COLUMN capacity_window_mins integer NOT NULL DEFAULT 5
  CHECK (capacity_window_mins BETWEEN 1 AND 20);

-- After applying: notify PostgREST to reload its schema cache:
--   NOTIFY pgrst, 'reload schema';
