-- Verify. Every corrected venue should now sit within 5km of its own postcode.
SELECT v.id, v.name, v.village, v.postcode, v.latitude, v.longitude,
       b.latitude AS old_lat, b.longitude AS old_lng
FROM venues v JOIN venue_coord_backup_20260907 b ON b.id = v.id
WHERE v.latitude IS DISTINCT FROM b.latitude OR v.longitude IS DISTINCT FROM b.longitude
ORDER BY v.village, v.name;

-- Count of rows changed. Compare against the number of UPDATEs you actually ran.
SELECT count(*) AS rows_changed
FROM venues v JOIN venue_coord_backup_20260907 b ON b.id = v.id
WHERE v.latitude IS DISTINCT FROM b.latitude OR v.longitude IS DISTINCT FROM b.longitude;

-- Nothing was inserted or deleted: this must still equal the pre-run count.
SELECT count(*) AS venues_total FROM venues;
