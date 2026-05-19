-- Per-slot order counters (updated on place / reject / slot change).
-- truck_id matches trucks.id type (TEXT in this project).

CREATE TABLE IF NOT EXISTS slot_bookings (
  truck_id         TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  event_date       DATE NOT NULL,
  collection_time  TEXT NOT NULL,
  order_count      INT  NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (truck_id, event_date, collection_time)
);

CREATE INDEX IF NOT EXISTS slot_bookings_truck_date_idx
  ON slot_bookings (truck_id, event_date);

-- Backfill from existing active orders
INSERT INTO slot_bookings (truck_id, event_date, collection_time, order_count)
SELECT truck_id, event_date::date, slot, COUNT(*)::int
FROM orders
WHERE slot IS NOT NULL
  AND status IN ('pending', 'confirmed', 'modified')
GROUP BY truck_id, event_date, slot
ON CONFLICT (truck_id, event_date, collection_time)
DO UPDATE SET
  order_count = EXCLUDED.order_count,
  updated_at  = now();
