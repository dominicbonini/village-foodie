-- ════════════════════════════════════════════════════════════════════════════════════
-- Per-device operator config (Package 3): binds a physical device to a van + its default screen +
-- push token. Keyed on device_id (per-DEVICE, not per-login — one login owns many device rows).
-- Additive. DEPLOY-COUPLED: /api/native/bind-device (GET+POST) SELECTs/INSERTs these columns and
-- /api/orders/submit reads push_token/notify_enabled — run this migration BEFORE deploying that code.
-- Truck-ownership: a device may only bind to a van whose van.truck_id === the token's truck (enforced
-- in the endpoint); truck_id is denormalised here for fast van→devices routing on the push send path.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS van_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       text NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,   -- trucks.id is TEXT (not uuid) — FK must match
  van_id         uuid REFERENCES truck_vans(id) ON DELETE SET NULL,        -- truck_vans.id IS uuid — correct as-is
  device_id      text NOT NULL UNIQUE,               -- stable client UUID (localStorage, first launch); re-bind = UPDATE
  push_token     text,                                -- APNs device token; NULL until push permission granted
  platform       text,                                -- 'ios' | 'web' | …
  default_screen text NOT NULL DEFAULT 'dashboard' CHECK (default_screen IN ('dashboard','kds')),
  notify_enabled boolean NOT NULL DEFAULT true,       -- device-level opt-out (van-level master lives in van_notification_prefs)
  last_seen      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Push send path resolves van → devices; look-ups also by truck.
CREATE INDEX IF NOT EXISTS van_devices_van_idx   ON van_devices (van_id);
CREATE INDEX IF NOT EXISTS van_devices_truck_idx ON van_devices (truck_id);

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'van_devices';
