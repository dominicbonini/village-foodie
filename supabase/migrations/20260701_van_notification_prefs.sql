-- ════════════════════════════════════════════════════════════════════════════════════
-- Per-van notification preferences (Package 5): van-level MASTER toggle per notification type. Phase 1
-- ships only type='order_pending' (an order needs confirming). Extensible: add rows for future types.
-- Effective rule = van master (this table, default ON when no row) AND device opt-out (van_devices.
-- notify_enabled). Additive. DEPLOY-COUPLED: the /api/orders/submit push path reads this — run BEFORE code.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS van_notification_prefs (
  van_id   uuid NOT NULL REFERENCES truck_vans(id) ON DELETE CASCADE,
  type     text NOT NULL,                    -- 'order_pending' (only type in Phase 1)
  enabled  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (van_id, type)
);

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────
-- SELECT * FROM van_notification_prefs;
