-- Add checkout upsell flag to existing rules
ALTER TABLE upsell_rules
ADD COLUMN IF NOT EXISTS show_at_checkout boolean NOT NULL DEFAULT false;

-- Richer upsell event tracking (one row per rule per order)
CREATE TABLE IF NOT EXISTS upsell_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       uuid        NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  order_id       text        NOT NULL,
  event_date     date        NOT NULL,
  rule_id        uuid,                          -- nullable: rule may be deleted later
  trigger_category text      NOT NULL,
  suggest_category text      NOT NULL,
  items_shown    text[]      NOT NULL DEFAULT '{}',
  items_added    jsonb       NOT NULL DEFAULT '{}',  -- { "Coke": 2, "Fanta": 1 }
  accepted       boolean     NOT NULL DEFAULT false, -- true if any item added
  total_value    numeric(10,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upsell_events_truck_date
  ON upsell_events (truck_id, event_date);
