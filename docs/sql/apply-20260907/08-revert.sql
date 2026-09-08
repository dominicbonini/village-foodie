-- 08 — ONLY IF NEEDED. Restores every future event's venue_id to the snapshot.
-- Idempotent; does not assume the 312 links were the only change.
UPDATE discovery_events e
SET venue_id = b.venue_id
FROM venue_link_backup_20260907 b
WHERE b.id = e.id
  AND e.venue_id IS DISTINCT FROM b.venue_id;

-- Expect 0 after reverting.
SELECT count(*) AS still_differing
FROM discovery_events e
JOIN venue_link_backup_20260907 b ON b.id = e.id
WHERE e.venue_id IS DISTINCT FROM b.venue_id;

-- Only once satisfied:
-- DROP TABLE venue_link_backup_20260907;
