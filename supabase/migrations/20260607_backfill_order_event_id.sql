-- 20260607_backfill_order_event_id.sql
-- Backfill orders.event_id, which was never written by any insert path until
-- 2026-06-07 (submit + manual order routes now set it).
--
-- Match rule: truck_id + event_date, but ONLY where exactly one non-cancelled
-- event exists for that truck+date. Orders on a same-date multi-event day are
-- DELIBERATELY left null — assigning either event would be a guess. Those are
-- handled by the display fallback in app/dashboard/[token]/page.tsx
-- (event_date + van_id match when event_id is null).
--
-- ⚠️ REVIEW BEFORE RUNNING. Run the count query first, then the UPDATE.

-- ── 1. Dry run: how many orders would be backfilled ──────────────────────────
-- SELECT count(*)
-- FROM orders o
-- WHERE o.event_id IS NULL
--   AND o.event_date IS NOT NULL
--   AND (
--     SELECT count(*) FROM truck_events e
--     WHERE e.truck_id = o.truck_id
--       AND e.event_date = o.event_date
--       AND e.status <> 'cancelled'
--   ) = 1;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
UPDATE orders o
SET event_id = (
  SELECT e.id FROM truck_events e
  WHERE e.truck_id = o.truck_id
    AND e.event_date = o.event_date
    AND e.status <> 'cancelled'
)
WHERE o.event_id IS NULL
  AND o.event_date IS NOT NULL
  AND (
    SELECT count(*) FROM truck_events e
    WHERE e.truck_id = o.truck_id
      AND e.event_date = o.event_date
      AND e.status <> 'cancelled'
  ) = 1;
