-- ════════════════════════════════════════════════════════════════════════════════════
-- Pre-order OPEN-WINDOW rule (apply by hand; additive + idempotent; confirm project ref ffphgwonshgxamtvefcv).
-- WHEN customers can start placing pre-orders for an event — the twin of the existing close/deadline
-- (trucks.preorder_deadline_*). A FIXED 9-option enum (no free-form lead → the discrete choices ARE the
-- floor; no min-lead validation needed):
--   'on_confirm' — open as soon as the event is confirmed/approved (EARLIEST; the default).
--   'day_of'     — open from MIDNIGHT (00:00, event-tz) on the event's date (LATEST).
--   '1d'..'7d'   — open from MIDNIGHT (00:00, event-tz) on the date N days before the event date.
-- Everything opens at start-of-day except 'on_confirm' (keys off confirmation, not a clock).
--
-- DEFAULT + BACKFILL = 'on_confirm' (open from event approval) — Dominic's directive: all trucks default
-- to from-event-approval. This preserves today's behaviour (a pre-order item is orderable once its event is
-- confirmed) while giving a concrete rule. NULL is still handled in code as "no gate" (belt-and-braces), but
-- after this migration no row is null.
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS preorder_open_rule text NOT NULL DEFAULT 'on_confirm'
  CHECK (preorder_open_rule IN ('on_confirm','day_of','1d','2d','3d','4d','5d','6d','7d'));

-- Backfill any pre-existing rows (the DEFAULT covers new rows; this is a no-op if the column was just added
-- with the default, and the safety net if it pre-existed nullable).
UPDATE trucks SET preorder_open_rule = 'on_confirm' WHERE preorder_open_rule IS NULL;

-- ── VERIFY (run after) — expect every truck = 'on_confirm', no nulls ──────────────────
-- SELECT preorder_open_rule, count(*) FROM trucks GROUP BY preorder_open_rule;
