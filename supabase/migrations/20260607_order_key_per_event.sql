-- 20260607_order_key_per_event.sql
-- Two-id architecture for orders:
--   order_key uuid — row identity. Every lookup, update, URL, FK. Never shown to humans.
--   id text       — per-event display number ("Order #5"). Restarts at 1 per event.
--                   NEVER used in a WHERE clause after this migration.
--
-- Pre-conditions (confirmed 2026-06-07): orders, production_slot_usage and
-- messages are EMPTY — no backfill, no counter seeding, no legacy lookup path.
--
-- Idempotent where possible; the PK swap is guarded so re-runs are safe.

-- ── 1. messages: drop the Studio-added FK on order_id ────────────────────────
-- messages is a log. It keeps order_id as PLAIN TEXT holding the display number
-- (alongside its existing truck_id) with no FK — log rows must never block an
-- order deletion, and ambiguity across events is acceptable for a legacy log.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_order_id_fkey;

-- ── 2. orders.order_key — the new row identity ───────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_key uuid NOT NULL DEFAULT gen_random_uuid();

-- ── 3. PK swap: global id pkey dies here, order_key becomes the PK ───────────
DO $$
BEGIN
  -- Drop the old PK on (id) — the cross-truck collision bug
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND contype = 'p'
      AND conname = 'orders_pkey'
      AND pg_get_constraintdef(oid) LIKE '%(id)%'
      AND pg_get_constraintdef(oid) NOT LIKE '%order_key%'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_pkey;
  END IF;

  -- Add the new PK on order_key (skip if already done)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (order_key);
  END IF;
END $$;

-- ── 4. Display-number integrity ───────────────────────────────────────────────
-- Per-event numbering: each event has at most one "Order #5".
CREATE UNIQUE INDEX IF NOT EXISTS orders_event_display_id
  ON orders (event_id, id) WHERE event_id IS NOT NULL;
-- No-event fallback: numbers from the truck-level sequence stay unique per truck.
CREATE UNIQUE INDEX IF NOT EXISTS orders_truck_display_id_no_event
  ON orders (truck_id, id) WHERE event_id IS NULL;

-- ── 5. Per-event counter ──────────────────────────────────────────────────────
ALTER TABLE truck_events
  ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;

-- Atomically increments and returns the next display number for an event.
-- Modelled on increment_order_counter (20260529). UPDATE..RETURNING is atomic:
-- concurrent callers serialise on the row lock, no read-max race.
CREATE OR REPLACE FUNCTION increment_event_order_counter(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter integer;
BEGIN
  UPDATE truck_events
  SET order_counter = order_counter + 1
  WHERE id = p_event_id
  RETURNING order_counter INTO v_counter;
  RETURN v_counter;  -- NULL if the event doesn't exist; caller falls back to truck counter
END;
$$;

-- ── 6. Truck-level fallback counter (no-event orders) ────────────────────────
-- Re-declared defensively: migration 20260529 may not have been applied to prod
-- (whatsapp_logs / upsell_events from the same era weren't). Both statements are
-- no-ops if it was. NOTE: trucks.id is TEXT (slug-style ids), hence p_truck_id text.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;

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

-- ── 7. RLS ────────────────────────────────────────────────────────────────────
-- No policy changes needed: RLS policies on orders are row-level and reference
-- no specific columns; added columns inherit existing table policies. All order
-- reads/writes go through service-role API routes, which bypass RLS anyway.

-- ── 8. Refresh PostgREST schema cache so the new column/functions are visible ─
NOTIFY pgrst, 'reload schema';
