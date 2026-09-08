-- 02 — PART A: create 3 venues. Nothing updates, nothing deletes.
-- 🔴 EXISTING VENUES ARE NOT TOUCHED. The 54 coordinate corrections stand.
-- Coordinates are Hatches Up's own (measured max error 127 m), each one PASSED the geo-validate
-- gauntlet, and each village comes from the POSTCODE's parish/district via postcodes.io — never from
-- the venue name.
INSERT INTO venues (id, name, village, postcode, latitude, longitude)
VALUES
  ('5160161b-a713-4976-8373-89279fb37494','The Yeerologist @ Eat17','Bishop''s Stortford','CM23 3AS',51.869906,0.161540),
  ('bc2173b8-e218-4880-9ad0-bd49e692eb42','Mrs Salisburys Carpark','Wickham Bishops','CM8 3NJ',51.778402,0.675606),
  ('67597fa0-1bcf-4a03-9717-bb83dadf532c','Daisy''s Milk Shed','Attleborough','NR17 1YG',52.523073,1.010511)
ON CONFLICT (name, village) DO NOTHING;

-- Expect 3.
SELECT count(*) AS created FROM venues WHERE id IN ('5160161b-a713-4976-8373-89279fb37494','bc2173b8-e218-4880-9ad0-bd49e692eb42','67597fa0-1bcf-4a03-9717-bb83dadf532c');
