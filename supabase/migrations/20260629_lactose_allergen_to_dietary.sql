-- ════════════════════════════════════════════════════════════════════════════════════
-- Reclassify LACTOSE: allergen → dietary (DATA migration — apply by hand).
-- Lactose is NOT one of the 14 UK regulated allergens (milk = "Dairy" is). The vocab moved it from
-- ALLERGEN_VOCAB → DIETARY_VOCAB (components/manage/primitives.tsx); this MOVES the stored data to match
-- so 'Lactose' isn't orphaned in allergens[] (where it's no longer a valid allergen vocab entry).
--
-- For every menu_items_db row whose allergens[] contains 'Lactose':
--   • remove 'Lactose' from allergens[]   (Dairy — the real milk allergen — is LEFT untouched)
--   • add 'Lactose' to dietary_info[]      (idempotent: only if not already present)
-- allergens_verified is NOT changed — this is a reclassification, not a new allergen claim, so confirmed
-- dishes stay confirmed (no forced re-confirm).
--
-- ░░ AFFECTED ROWS (audited 2026-06-29): ALL 22 are pizzeria-gusto (live/trialling); 0 on any other truck;
--    0 rows already have 'Lactose' in dietary_info (no dedup conflict). Every affected row also has 'Dairy'
--    in allergens, which STAYS — so customers still see the milk allergen; only Lactose moves to dietary.
--    This deliberately TOUCHES Gusto's live data (unlike the slice-1 freeze) — it's the intended reclassify.
--
-- Columns are text[] (native arrays). Idempotent: re-running matches 0 rows (none left with Lactose in
-- allergens). No schema change.
-- ════════════════════════════════════════════════════════════════════════════════════

UPDATE menu_items_db
SET allergens    = array_remove(allergens, 'Lactose'),
    dietary_info = CASE
                     WHEN 'Lactose' = ANY (COALESCE(dietary_info, '{}'::text[])) THEN dietary_info
                     ELSE array_append(COALESCE(dietary_info, '{}'::text[]), 'Lactose')
                   END
WHERE allergens @> ARRAY['Lactose']::text[];

-- ── VERIFY (run after) — expect still_in_allergens = 0, now_in_dietary = 22 ──────────────
-- SELECT
--   (SELECT count(*) FROM menu_items_db WHERE allergens   @> ARRAY['Lactose']::text[]) AS still_in_allergens,
--   (SELECT count(*) FROM menu_items_db WHERE dietary_info @> ARRAY['Lactose']::text[]) AS now_in_dietary,
--   (SELECT count(*) FROM menu_items_db WHERE allergens   @> ARRAY['Dairy']::text[])   AS dairy_untouched_should_stay;
