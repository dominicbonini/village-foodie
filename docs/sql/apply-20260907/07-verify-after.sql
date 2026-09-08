-- 07 — Run after all five chunks.

-- 1. Counts. Expect: 669 | 381 | 381   (was 669 | 69 | 69)
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;

-- 2. Trucks now pinnable. 7 today; not predicted — this is a measurement.
SELECT count(DISTINCT e.truck_name) AS pinnable_trucks
FROM discovery_events e
JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE AND v.latitude IS NOT NULL;

-- 3. Nothing else moved. Expect EXACTLY 312.
--    More than 312 means something else wrote to the table (the hourly cron can).
SELECT count(*) AS rows_differing_from_snapshot
FROM discovery_events e
JOIN venue_link_backup_20260907 b ON b.id = e.id
WHERE e.venue_id IS DISTINCT FROM b.venue_id;
