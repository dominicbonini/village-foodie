-- 06 — 🔴 THE FIVE MOVES OVER 20 km. EACH IS A SEPARATE DECISION. Read every comment first.
-- These are NOT included in Tier A or Tier B. Every one is a village-centroid correction, which means
-- the venue's own postcode was unusable — so the evidence is weaker precisely where the move is largest.
-- Delete any line you do not want before running.
BEGIN;
-- Bailey Hills Estate [Bailey Hills] — MOVES 116.8 km
--   old 54.8765,-1.4407   new 53.852123,-1.841124   source postcodes.io/places
--   flagged because: placeholder decimals ; postcode NE33 2QB is not a real postcode
--   future events affected: 1 (1 visible on Village Foodie)
UPDATE venues SET latitude = 53.852123, longitude = -1.841124 WHERE id = 'c163445a-73c5-42f9-b8a9-d43eadfabff0';  -- Bailey Hills Estate [Bailey Hills] 116.8km  placeholder decimals

-- Lakeside Caravan Park [Denver] — MOVES 398.0 km
--   old 55.378051,-3.435973   new 52.588136,0.381031   source postcodes.io/places
--   flagged because: sentinel coordinate (GB centroid class)
--   future events affected: 0 (0 visible on Village Foodie)
UPDATE venues SET latitude = 52.588136, longitude = 0.381031 WHERE id = '1ddd233c-e205-49a6-83c4-b2c7faa40d9c';  -- Lakeside Caravan Park [Denver] 398.0km  sentinel coordinate (GB centroid class)

-- We Are Wintringham [Wintringham] — MOVES 29.9 km
--   old 52.4797,-0.3409   new 52.221272,-0.218070   source postcodes.io/places
--   flagged because: 16.0km from its own postcode PE8 6HX
--   future events affected: 0 (0 visible on Village Foodie)
UPDATE venues SET latitude = 52.221272, longitude = -0.218070 WHERE id = 'efd231fa-c9f0-4268-8b2f-3fd8cd62e153';  -- We Are Wintringham [Wintringham] 29.9km  16.0km from its own postcode PE8 6HX

-- Hinchingbrooke house events [Hinchingbrooke] — MOVES 27.4 km
--   old 52.37,0.2   new 52.328714,-0.197026   source postcodes.io/places
--   flagged because: 76.8km from its own postcode PE20 3RW
--   future events affected: 0 (0 visible on Village Foodie)
UPDATE venues SET latitude = 52.328714, longitude = -0.197026 WHERE id = '0c33f397-c860-4709-8dc5-5be6eabe9247';  -- Hinchingbrooke house events [Hinchingbrooke] 27.4km  76.8km from its own postcode PE20 3RW

-- The 'Case is Altered' pub [Bentley] — MOVES 20.9 km
--   old 52.0798,0.7998   new 51.991344,1.068594   source postcodes.io/places
--   flagged because: 18.7km from its own postcode CO10 8BG
--   future events affected: 0 (0 visible on Village Foodie)
UPDATE venues SET latitude = 51.991344, longitude = 1.068594 WHERE id = 'ea68fa0d-96de-4140-9808-c966cf298af4';  -- The 'Case is Altered' pub [Bentley] 20.9km  18.7km from its own postcode CO10 8BG
COMMIT;

-- Expect up to 5 rows updated (fewer if you deleted lines).
