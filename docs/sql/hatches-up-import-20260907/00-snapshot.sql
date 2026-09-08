-- 00 — RUN FIRST. Lets you see exactly what this import added, and remove it.
CREATE TABLE IF NOT EXISTS hu_import_backup_20260907 AS
SELECT id, truck_name, event_date, venue_name, venue_id, source, now() AS captured_at
FROM discovery_events WHERE event_date >= CURRENT_DATE;

SELECT count(*) AS future_rows_captured FROM hu_import_backup_20260907;
