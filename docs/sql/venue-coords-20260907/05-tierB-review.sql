-- 05 — TIER B — 22 UPDATEs. 🔴 REVIEW BEFORE RUNNING.
-- These venues have NO usable postcode (invalid, or it disagreed with the village by more than 10km),
-- so the new coordinate is the VILLAGE CENTROID from postcodes.io/places — correct to the village, not
-- to the building. That is an improvement on a fabricated point but a LOSS of precision on a merely
-- imprecise one. Run this only if you accept village-level accuracy for these rows.
-- All moves here are 20km or less; the five larger ones are in the next file, deliberately separated.
BEGIN;
UPDATE venues SET latitude = 52.122838, longitude = 1.523585 WHERE id = '8be532a7-fbfa-41a6-a73c-4b2ad1705e11';  -- Sudbourne Village Hall [Sudbourne] 4.8km  placeholder decimals
UPDATE venues SET latitude = 52.301643, longitude = 0.664570 WHERE id = '1f730ad8-9fb0-4a7f-a760-155c32cd7e37';  -- Dragon Fest [West Stow] 7.4km  placeholder decimals
UPDATE venues SET latitude = 52.431795, longitude = 0.238722 WHERE id = 'b6076e25-0fdc-4fe1-8571-17c54d797a4a';  -- Little Downham Equine Event [Little Downham] 5.2km  placeholder decimals
UPDATE venues SET latitude = 52.527100, longitude = 0.387694 WHERE id = 'ee71be90-87ef-4f8c-be0b-362931374701';  -- Southery Carnival [Southery] 6.4km  placeholder decimals
UPDATE venues SET latitude = 52.334469, longitude = 0.482052 WHERE id = 'fca198cc-74fe-4b34-a33c-8115d0692ec4';  -- Workington Beer Festival [Worlington] 14.7km  placeholder decimals
UPDATE venues SET latitude = 52.337201, longitude = 1.672156 WHERE id = '75b590e6-07c4-4e3d-83cd-be0d9937d89c';  -- Old Hall Southwold [Reydon] 7.2km  placeholder decimals
UPDATE venues SET latitude = 52.386737, longitude = 0.201891 WHERE id = '943cce24-c0fd-4c0d-aac7-1fda0d6ea9f5';  -- Witchford Colts Presentation Day [Witchford] 5.4km  placeholder decimals
UPDATE venues SET latitude = 52.188937, longitude = 0.997583 WHERE id = 'f1c60d5a-c585-4b10-9e0c-7f411bc50602';  -- Family Friendly Market [Stowmarket] 1.3km  placeholder decimals
UPDATE venues SET latitude = 51.969615, longitude = 1.249128 WHERE id = '5986b9bf-c90c-48fc-a4cf-de62dd0f4118';  -- Auto Shack at the Corner Garage [Shotley] 1.4km  placeholder decimals
UPDATE venues SET latitude = 52.059977, longitude = 1.274553 WHERE id = '495f56e4-86f8-4980-9af3-82d012b9c3f2';  -- Martlesham Leisure [Martlesham Heath] 3.5km  placeholder decimals
UPDATE venues SET latitude = 52.127722, longitude = 1.412390 WHERE id = 'bc5761d7-2d79-4836-894d-8105e7f3a567';  -- The Rendlesham Show [Rendlesham] 3.1km  placeholder decimals
UPDATE venues SET latitude = 52.286888, longitude = 0.054944 WHERE id = 'e1af98eb-c075-4170-876d-71d297ad22fa';  -- Northstowe Foodies [Northstowe] 4.7km  placeholder decimals
UPDATE venues SET latitude = 52.194653, longitude = 0.264976 WHERE id = '87f2bb85-b44a-4161-9547-4955dd88e081';  -- Gt Wilbraham [Great Wilbraham] 0.3km  postcode CB21 is not a real postcode
UPDATE venues SET latitude = 52.145263, longitude = 0.343940 WHERE id = '76f68fd6-fb4c-4129-adc7-eb559aad7796';  -- The Chestnut Tree [West Wratting] 0.4km  postcode CB21 5ND is not a real postcode
UPDATE venues SET latitude = 51.989654, longitude = 0.598589 WHERE id = '594248b3-0edd-46c7-8c43-cea8d1302deb';  -- Castle Hedingham Village Hall [Castle Hedingham] 1.8km  postcode CO9 3ES is not a real postcode
UPDATE venues SET latitude = 52.059837, longitude = 0.355118 WHERE id = '97d47dc3-2d03-4db3-b51c-9b6c8c825104';  -- Bartlow 3 Counties Charity Walk [Camps End] 1.8km  postcode CB1 6PP is not a real postcode
UPDATE venues SET latitude = 52.023283, longitude = 0.242663 WHERE id = 'cc40d3db-dfab-47dc-a79a-49b89237183a';  -- Plantation YFC [Saffron Walden] 0.4km  postcode CB11 3EB is not a real postcode
UPDATE venues SET latitude = 51.972283, longitude = 0.774950 WHERE id = '4effab05-e09c-4c11-9264-225003a0c341';  -- Bures Green [Bures] 7.2km  postcode CO8 5 is not a real postcode
UPDATE venues SET latitude = 52.361058, longitude = 1.128714 WHERE id = 'a5615d9b-9581-4d08-9128-d2fbac7addb6';  -- Place Farm Shop [Stuston] 13.6km  5.2km from its own postcode IP22 2TD
UPDATE venues SET latitude = 52.188937, longitude = 0.997583 WHERE id = '33ddf6f3-e5ca-45cb-84b5-68059b9560b4';  -- Finborough School [Stowmarket] 1.6km  postcode IP3 1JQ is not a real postcode
UPDATE venues SET latitude = 51.889709, longitude = 0.899348 WHERE id = 'ead9bdb0-22c8-4832-8251-4acedf97d3c0';  -- Chesterwell Estate [Colchester] 3.0km  postcode CO4 6XQ is not a real postcode
UPDATE venues SET latitude = 52.057066, longitude = 1.152832 WHERE id = 'd42e5e90-58a4-439e-8837-391bb9cd23f9';  -- Suffolk Modified event [Ipswich] 0.1km  postcode IP1 1TT is not a real postcode
COMMIT;

-- Expect 22 rows updated.
