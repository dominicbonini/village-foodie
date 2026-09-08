-- 03 — TIER A, chunk 2 of 3 — 18 UPDATEs.
-- Every one of these has a VALID postcode that AGREES with its own village (within 10km), so the new
-- coordinate is the postcode's own point from postcodes.io. Nothing inserts, nothing deletes.
BEGIN;
UPDATE venues SET latitude = 52.294680, longitude = 1.205701 WHERE id = '8d9b4725-9f57-4082-adfe-8745993b9d21';  -- Redlingfield (The Knoll) [Redlingfield] 12.2km  12.2km from its own postcode IP23 7QS
UPDATE venues SET latitude = 52.093455, longitude = 0.272619 WHERE id = 'b5cb5fc2-b5c8-48a3-87e8-20bff0e5143c';  -- Wylde Sky Brewery [Linton] 6.8km  6.8km from its own postcode CB21 4XN
UPDATE venues SET latitude = 51.990681, longitude = 0.091064 WHERE id = '129e6b24-f78a-49b6-8454-4dbdd8a3722c';  -- The Bull [Lower Green] 12.4km  12.4km from its own postcode CB11 4SB
UPDATE venues SET latitude = 52.383781, longitude = -0.047423 WHERE id = 'a76e3348-7f01-4067-b3b1-5b75a0cb1e5d';  -- Pidley Community Centre [Pidley] 10.2km  10.2km from its own postcode PE28 3DA
UPDATE venues SET latitude = 52.191759, longitude = 1.574614 WHERE id = '16624ec7-99bc-4668-b157-504da9742eca';  -- Mill Hill [Aldringham] 6.0km  6.0km from its own postcode IP16 4PZ
UPDATE venues SET latitude = 52.271676, longitude = 0.295297 WHERE id = 'b726f97c-20ad-47b4-b137-33d914602f47';  -- Dyke’s End [Reach] 7.9km  7.9km from its own postcode CB25 0JD
UPDATE venues SET latitude = 52.194016, longitude = 0.107472 WHERE id = '04dd7acc-3ef3-47d2-8fba-46af317aac78';  -- Newnham [Cambridge] 16.5km  16.5km from its own postcode CB3 9JW
UPDATE venues SET latitude = 52.074872, longitude = 1.099294 WHERE id = 'fe431768-e85d-421f-873f-32dbef7c9c7c';  -- Loraine Victory Hall [Bramford] 8.4km  8.4km from its own postcode IP8 4AL
UPDATE venues SET latitude = 52.246117, longitude = 0.114437 WHERE id = '2671edb2-a53a-4790-811d-66f6da65a25a';  -- The Cavendish School [Impington] 15.8km  15.8km from its own postcode CB24 9LY
UPDATE venues SET latitude = 52.190554, longitude = 0.129985 WHERE id = '32d81b96-eb21-40a6-ba7f-4fa7e79ec9db';  -- Honeywell House [Cambridge] 15.9km  15.9km from its own postcode CB2 8BX
UPDATE venues SET latitude = 52.042740, longitude = 0.446690 WHERE id = '09b7651d-c303-4723-8eab-1ad690749208';  -- Steeple Stores - Westrope Motors [Steeple Bumpstead] 11.6km  11.6km from its own postcode CB9 7DG
UPDATE venues SET latitude = 52.319531, longitude = 0.902194 WHERE id = 'cafc5948-3e85-451b-8391-2b7d7d8aabfa';  -- Stanton - Shepherds Grove Park Residential Park [Stanton] 10.7km  10.7km from its own postcode IP31 2AY
UPDATE venues SET latitude = 52.097256, longitude = 1.115742 WHERE id = '144a1a91-acc1-45ab-b8bc-0be39cf3578a';  -- One stop - co-op [CLAYDON] 10.0km  10.0km from its own postcode IP6 0AG
UPDATE venues SET latitude = 52.040128, longitude = 1.027745 WHERE id = '93f1e25e-9725-4f23-9159-d2e7b3e25785';  -- Kingfisher pub [Chantry] 13.7km  13.7km from its own postcode IP8 3QW
UPDATE venues SET latitude = 52.080680, longitude = -1.409940 WHERE id = '300d4388-1cba-44ed-ae6b-52450efa4a94';  -- Longford Park [Bodicote] 9.9km  9.9km from its own postcode OX15 6AY
UPDATE venues SET latitude = 52.098456, longitude = 0.718937 WHERE id = 'f2b5493b-0a0b-4a28-907b-ad4dd496f9fd';  -- Kentwell Hall [Long Melford] 6.4km  6.4km from its own postcode CO10 9BA
UPDATE venues SET latitude = 52.319531, longitude = 0.902194 WHERE id = 'ecd1de1f-78b4-45ac-8210-3f1e8d243041';  -- Shepherds Grove Community Room [Stanton] 5.3km  5.3km from its own postcode IP31 2AY
UPDATE venues SET latitude = 51.889946, longitude = 0.261768 WHERE id = '660fc1a1-2800-47b3-bba7-79cb0e3e5b79';  -- Titan Airways [Stansted Airport] 8.5km  8.5km from its own postcode CM24 1RW
COMMIT;

-- Expect 18 rows updated.
