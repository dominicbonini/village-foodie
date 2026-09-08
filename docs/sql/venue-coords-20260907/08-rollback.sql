-- ROLLBACK. Restores every venue's coordinates from the snapshot. Idempotent.
-- 1. LOOK FIRST — what would change back.
SELECT v.id, v.name, v.latitude, v.longitude, b.latitude AS restore_lat, b.longitude AS restore_lng
FROM venues v JOIN venue_coord_backup_20260907 b ON b.id = v.id
WHERE v.latitude IS DISTINCT FROM b.latitude OR v.longitude IS DISTINCT FROM b.longitude;

-- 2. Then:
UPDATE venues v
SET latitude = b.latitude, longitude = b.longitude
FROM venue_coord_backup_20260907 b
WHERE b.id = v.id
  AND (v.latitude IS DISTINCT FROM b.latitude OR v.longitude IS DISTINCT FROM b.longitude);

-- Expect 0 afterwards.
SELECT count(*) AS still_differing
FROM venues v JOIN venue_coord_backup_20260907 b ON b.id = v.id
WHERE v.latitude IS DISTINCT FROM b.latitude OR v.longitude IS DISTINCT FROM b.longitude;
-- Only when satisfied: DROP TABLE venue_coord_backup_20260907;
