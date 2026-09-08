-- 00 — RUN THIS FIRST. Captures the current venue_id of every future event so the whole
-- thing is reversible. Superset of the 312 rows about to change.
CREATE TABLE IF NOT EXISTS venue_link_backup_20260907 AS
SELECT id, venue_id, event_date, truck_name, venue_name, village, now() AS captured_at
FROM discovery_events
WHERE event_date >= CURRENT_DATE;

-- Expect: rows_captured 669 | already_linked 69 | currently_null 600
SELECT count(*) AS rows_captured,
       count(venue_id) AS already_linked,
       count(*) - count(venue_id) AS currently_null
FROM venue_link_backup_20260907;
