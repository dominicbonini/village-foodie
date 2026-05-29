-- Per-truck atomic order counter used to generate sequential order IDs (0001, 0002, ...)
ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;

-- Atomically increments the counter and returns the new value.
-- Called by nextOrderId() in lib/order-utils.ts.
CREATE OR REPLACE FUNCTION increment_order_counter(p_truck_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter integer;
BEGIN
  UPDATE trucks
  SET order_counter = order_counter + 1
  WHERE id = p_truck_id
  RETURNING order_counter INTO v_counter;
  RETURN v_counter;
END;
$$;
