-- 04 — TIER A, chunk 3 of 3 — 18 UPDATEs.
-- Every one of these has a VALID postcode that AGREES with its own village (within 10km), so the new
-- coordinate is the postcode's own point from postcodes.io. Nothing inserts, nothing deletes.
BEGIN;
UPDATE venues SET latitude = 52.338160, longitude = 0.507814 WHERE id = '0e6fe5d0-d66e-45b5-92d5-88ee0cb334db';  -- 21 Market Place [Mildenhall] 11.0km  11.0km from its own postcode IP28 7DT
UPDATE venues SET latitude = 51.973883, longitude = 0.236813 WHERE id = '676a429b-0d65-47de-b88e-0e36adb6b6c7';  -- Nina’s Farm [Widdington] 10.3km  10.3km from its own postcode CB11 3RZ
UPDATE venues SET latitude = 52.314416, longitude = 1.270833 WHERE id = '80b70648-855d-405e-a3db-222907c1ed5a';  -- Mid Suffolk Slipper Swap [Stradbroke] 7.4km  7.4km from its own postcode IP21 5JN
UPDATE venues SET latitude = 52.451621, longitude = 1.701312 WHERE id = '48e74210-d473-4924-a200-ffc0b9ba2a2f';  -- Scout Hut at Old Church Hall [Carlton Colville] 5.1km  5.1km from its own postcode NR33 8JD
UPDATE venues SET latitude = 52.308146, longitude = 0.766601 WHERE id = '719e43d1-1777-440f-b09d-61c66a08974d';  -- War Memorial [Great Livermere] 8.5km  8.5km from its own postcode IP31 1JT
UPDATE venues SET latitude = 52.093455, longitude = 0.272619 WHERE id = 'f77c2468-09ce-46b6-bd75-0390c014298c';  -- Wylde Sky Taproom [Linton] 9.7km  9.7km from its own postcode CB21 4XN
UPDATE venues SET latitude = 52.169785, longitude = 0.107847 WHERE id = 'e0e5a4f5-d694-4518-b01a-f5cc5220f5c3';  -- Trumpington Meadows, Kestrel Rise [Trumpington Meadows] 14.9km  14.9km from its own postcode CB2 9FT
UPDATE venues SET latitude = 51.969947, longitude = 0.823746 WHERE id = 'c02e7786-dc4e-4a73-b2d0-b72295a1752c';  -- Suffolk Distillery [Stoke By Nayland] 10.9km  10.9km from its own postcode CO6 4ND
UPDATE venues SET latitude = 52.111383, longitude = 0.693315 WHERE id = '8e6cc681-6c23-433b-9671-f9657e5a7851';  -- Old Brewery [Stansfield] 16.7km  16.7km from its own postcode CO10 9AR
UPDATE venues SET latitude = 52.699768, longitude = 1.510214 WHERE id = 'e1feecc6-1df6-427b-acf4-061769576b31';  -- Ludham bridge [Ludham] 8.2km  8.2km from its own postcode NR29 5NX
UPDATE venues SET latitude = 51.997102, longitude = 0.106134 WHERE id = '22695678-c427-417b-ad12-d3d2dc087591';  -- BRONTE [SAFFRON WALDEN] 10.5km  10.5km from its own postcode CB11 4RY
UPDATE venues SET latitude = 52.020936, longitude = 0.287203 WHERE id = 'e52b50a0-33b7-4598-ab74-e52ab78a4f90';  -- Sewards End Village hall [Sewards End] 5.6km  5.6km from its own postcode CB10 2LG
UPDATE venues SET latitude = 52.079764, longitude = 0.185391 WHERE id = 'ef87c46a-cd38-48bd-9488-b986391a392c';  -- Wellcome Genome Campus [Hinxton] 6.5km  6.5km from its own postcode CB10 1SA
UPDATE venues SET latitude = 52.494586, longitude = 0.872187 WHERE id = '7bc6a7b4-69f4-4d7c-9ced-2908e3ede6de';  -- Great Hockham [Great Hockham] 11.1km  11.1km from its own postcode IP24 1PQ
UPDATE venues SET latitude = 52.227865, longitude = -0.288435 WHERE id = '9a183b3c-c48e-4fa0-a2b0-c40337ee1d0b';  -- George and Dragon [Eaton Socon] 13.9km  13.9km from its own postcode PE19 8ES
UPDATE venues SET latitude = 52.169785, longitude = 0.107847 WHERE id = '2009d680-af82-40df-98be-ed30424278b6';  -- Trumpington Meadows Food Vans [Trumpington] 15.2km  15.2km from its own postcode CB2 9FT
UPDATE venues SET latitude = 52.169785, longitude = 0.107847 WHERE id = 'a5d84cf4-9e1f-4ad1-b4b5-bef57cefdaae';  -- The real Trumpington page [Trumpington] 15.2km  15.2km from its own postcode CB2 9FT
UPDATE venues SET latitude = 52.665915, longitude = 1.506226 WHERE id = 'f177af7c-d8c9-4211-9123-b4e1fc5d8089';  -- SWVH [South Walsham] 7.2km  7.2km from its own postcode NR13 6DZ
COMMIT;

-- Expect 18 rows updated.
