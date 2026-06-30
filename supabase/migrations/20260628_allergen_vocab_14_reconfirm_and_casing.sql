-- ════════════════════════════════════════════════════════════════════════════════════
-- Allergen vocab → 14 UK statutory allergens: EXISTING-DATA migration (DATA only, no schema)
-- Pairs with components/manage/primitives.tsx ALLERGEN_VOCAB:
--   removed generics  : 'Nuts', 'Shellfish'
--   replacements added: 'Peanuts','Tree nuts','Crustaceans','Molluscs','Sesame','Lupin','Sulphites'
--
-- ░░ SAFETY — Gusto is LIVE ░░
-- EVERY data-modifying statement EXCLUDES truck_id = 'pizzeria-gusto' (modifier_options via the
-- modifier_groups join). Gusto's rows stay FROZEN exactly as-is — allergens_verified=true and
-- their current chips intact. Audit (2026-06-28) confirmed Gusto carries the generic 'Nuts'
-- (6 rows: Dolce Biscoff, Nutella Dream, Tiramisu, Cannoli, Genovese, Napolitano) and the
-- mis-cased dietary 'Dairy free' (1 row: Marinara). Per Dominic these MUST NOT change, so this
-- migration deliberately leaves them untouched (Gusto keeps showing the generic 'Nuts' string,
-- which still renders fine — customer display is exact-string passthrough, not vocab-bound).
--
-- Columns allergens / dietary_info are text[] (native Postgres arrays) on both tables.
-- SAFE TO RUN PRE-DEPLOY: (a) reuses the already-deployed allergens_verified warning mechanism;
-- (b) casing rewrites are passthrough display strings — no behaviour depends on the vocab change.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── a) RE-CONFIRM the removed generics (NON-Gusto, menu_items_db only) ──────────────────
-- Rows still carrying 'Nuts' or 'Shellfish' (no longer in the vocab) → allergens_verified=false.
-- This HIDES the stale generic from customers (deployed warning) and raises the per-item
-- re-confirm prompt where the operator later picks Peanuts vs Tree nuts / Crustaceans vs
-- Molluscs (wizard, later slice). The generic string is LEFT IN PLACE — nothing is lost; we
-- cannot infer the split, so a human re-confirms.
UPDATE menu_items_db
SET    allergens_verified = false
WHERE  truck_id <> 'pizzeria-gusto'
  AND  allergens && ARRAY['Nuts','Shellfish']::text[];

-- ── b) CASING NORMALISATION (NON-Gusto, pure rewrites, allergens_verified untouched) ────
-- menu_items_db: 'Egg'→'Eggs' (allergens); 'Gluten-Free'→'Gluten Free' and
-- 'Dairy free'→'Dairy Free' (dietary_info). array_replace is a no-op when the value is absent.
UPDATE menu_items_db
SET    allergens    = array_replace(allergens, 'Egg', 'Eggs'),
       dietary_info = array_replace(array_replace(dietary_info, 'Gluten-Free', 'Gluten Free'), 'Dairy free', 'Dairy Free')
WHERE  truck_id <> 'pizzeria-gusto'
  AND  ( allergens && ARRAY['Egg']::text[]
      OR dietary_info && ARRAY['Gluten-Free','Dairy free']::text[] );

-- modifier_options: SAME casing rewrites, scoped to NON-Gusto groups via the group join.
-- NOTE: modifier_options has NO allergens_verified column, so the re-confirm flag in (a) does
-- NOT apply to options. The NON-Gusto 'Shellfish' option rows (5: Prawn/Prawns) keep the
-- generic string for passthrough display; option-level re-confirm is a later wizard-slice
-- concern (would need a schema add or wizard handling). All affected option rows are
-- test-truck / real-thai-food (not the live Gusto truck), so no live customer-safety regression.
UPDATE modifier_options o
SET    allergens    = array_replace(o.allergens, 'Egg', 'Eggs'),
       dietary_info = array_replace(array_replace(o.dietary_info, 'Gluten-Free', 'Gluten Free'), 'Dairy free', 'Dairy Free')
FROM   modifier_groups g
WHERE  o.group_id = g.id
  AND  g.truck_id <> 'pizzeria-gusto'
  AND  ( o.allergens && ARRAY['Egg']::text[]
      OR o.dietary_info && ARRAY['Gluten-Free','Dairy free']::text[] );
