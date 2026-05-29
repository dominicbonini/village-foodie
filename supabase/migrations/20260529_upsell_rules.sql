CREATE TABLE IF NOT EXISTS upsell_rules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id          text        NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  trigger_category  text        NOT NULL,
  suggest_category  text        NOT NULL,
  max_suggestions   integer     NOT NULL DEFAULT 3,
  show_at_checkout  boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upsell_rules_truck_id ON upsell_rules (truck_id);
