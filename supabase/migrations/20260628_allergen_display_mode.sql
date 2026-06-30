-- ════════════════════════════════════════════════════════════════════════════════════
-- Allergen wizard slice-4: trucks.allergen_display_mode (SCHEMA only — additive, no data writes)
--
-- Stores the operator's chosen allergen display mode, set when they complete the wizard:
--   'per_dish' → customer menu shows per-item (verified) allergens; card entry hidden
--   'card'     → customer menu shows the allergen card; per-item allergen chips hidden
--   'both'     → both shown
--   NULL       → unset/legacy → the customer page treats it as 'both' (show whatever exists),
--                so existing trucks (incl. Gusto) keep their current display with NO change.
--
-- SAFETY: purely additive nullable column with no default → touches ZERO existing rows. Gusto and
-- every other truck stay exactly as-is until they actively pick a mode in the wizard. Safe pre-deploy
-- (the customer menu + manage both fall back to null = 'both' / legacy behaviour).
--
-- A CHECK keeps the value to the known set (NULL allowed). Run before/with the deploy.
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS allergen_display_mode text;

ALTER TABLE trucks
  DROP CONSTRAINT IF EXISTS trucks_allergen_display_mode_check;

ALTER TABLE trucks
  ADD CONSTRAINT trucks_allergen_display_mode_check
  CHECK (allergen_display_mode IS NULL OR allergen_display_mode IN ('per_dish', 'card', 'both'));
