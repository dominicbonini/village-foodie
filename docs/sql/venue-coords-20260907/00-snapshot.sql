-- 00 — RUN FIRST. Captures every venue's current coordinates so any correction is reversible.
CREATE TABLE IF NOT EXISTS venue_coord_backup_20260907 AS
SELECT id, name, village, postcode, latitude, longitude, now() AS captured_at
FROM venues;

-- Expect 574 rows.
SELECT count(*) AS rows_captured, count(latitude) AS with_coords FROM venue_coord_backup_20260907;
