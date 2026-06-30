-- Hide the internal group NAME from customers for AI-import-inferred custom-extra (variant) groups.
-- These groups are named "Category - Name [N]" internally (operator Custom Extras editor + dedupe key),
-- which must NOT leak to customers — the order page shows "Choose an option" instead when hide_name = true.
-- Default false so EVERY existing + manually-created group keeps showing its (operator-meaningful) name.
-- commit-menu sets this true only for groups derived from _inferredFromVariants import grouping.
ALTER TABLE modifier_groups
  ADD COLUMN IF NOT EXISTS hide_name boolean NOT NULL DEFAULT false;

-- Verify:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'modifier_groups' AND column_name = 'hide_name';
