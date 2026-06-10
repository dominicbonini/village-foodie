-- One-off backfill: close events stuck 'open' from a prior day.
-- The old auto-event-scheduler compared UTC time against venue-local event_date/end_time and
-- only ever looked at event_date = today(UTC), so a slipped close left the event 'open' forever
-- (the stale-live bug that polluted other events' slot/deal/pause resolution). The rewritten
-- function now self-heals every cycle; this immediately clears events whose date is already in
-- the past so the fix doesn't have to wait for the next cron tick.
--
-- Strictly event_date < CURRENT_DATE: unambiguously over regardless of timezone. Today's events
-- are intentionally left to the function (it applies the precise London-local end_time check).
UPDATE truck_events
SET status = 'closed',
    closed_at = COALESCE(closed_at, now())
WHERE status = 'open'
  AND event_date < CURRENT_DATE;
