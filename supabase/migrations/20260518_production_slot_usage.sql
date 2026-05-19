-- Batch-based capacity per production window (not per customer order).
-- units_by_cat stores item quantities, e.g. {"pizzas": 7} → ceil(7/3) = 3 batches if batch_size is 3.

CREATE TABLE IF NOT EXISTS production_slot_usage (
  truck_id         TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  event_date       DATE NOT NULL,
  production_slot  TEXT NOT NULL,
  units_by_cat     JSONB NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (truck_id, event_date, production_slot)
);

CREATE INDEX IF NOT EXISTS production_slot_usage_truck_date_idx
  ON production_slot_usage (truck_id, event_date);

-- First API load after deploy will backfill from existing orders automatically.
