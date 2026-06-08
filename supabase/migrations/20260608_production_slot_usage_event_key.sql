-- Re-key production_slot_usage by EVENT (leak-map option B). Same-date events were
-- pooling because the PK was (truck_id, event_date, production_slot). Re-key to
-- (truck_id, event_id, production_slot) so each event's load is physically segregated.
--
-- Apply in chunks in the Supabase SQL editor, in order. event_id is UUID (matches
-- truck_events.id and orders.event_id; trucks.id / truck_id stay TEXT per the project).
-- Service-role only table — no RLS change. After Chunk 3 the table is empty; the code's
-- lazy reseed covers reads until the backfill route runs.

-- ── Chunk 1: add the column (nullable for transition) ───────────────────────────────
ALTER TABLE production_slot_usage
  ADD COLUMN IF NOT EXISTS event_id uuid
  REFERENCES truck_events(id) ON DELETE CASCADE;

-- ── Chunk 2: drop the old date PK, add the event-keyed unique index (upsert arbiter) ─
ALTER TABLE production_slot_usage
  DROP CONSTRAINT IF EXISTS production_slot_usage_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS production_slot_usage_truck_event_slot_uidx
  ON production_slot_usage (truck_id, event_id, production_slot);

-- ── Chunk 3: clear pooled rows (cannot be un-pooled; backfill rebuilds per event) ───
DELETE FROM production_slot_usage;

-- ── Chunk 4: read index for the event-scoped path (keep the date index too) ─────────
CREATE INDEX IF NOT EXISTS production_slot_usage_truck_event_idx
  ON production_slot_usage (truck_id, event_id);

-- ── Chunk 5: reload PostgREST so the new column is visible to the API ────────────────
NOTIFY pgrst, 'reload schema';

-- event_date column + (truck_id, event_date) index are KEPT: rebuildProductionSlotUsage
-- and the cancel/self-heal paths delete a whole date's rows in one statement.
--
-- After running: deploy the event-keyed code, then POST
--   /api/admin/backfill-usage?secret=$SUPABASE_SERVICE_ROLE_KEY
-- to deterministically rebuild every upcoming event from the orders table.
