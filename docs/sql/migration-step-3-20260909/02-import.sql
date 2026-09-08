-- 255 venues that exist in the Sheet's Venues tab and not in `venues`.
--
-- ⚠️ REGENERATED 9 September 2026. The previous version of this file DID NOT EXECUTE:
--    `ERROR: 42601: syntax error at or near "("`. The generator appended the tuple separator with
--    `.join(',\n')` AFTER the trailing `-- comment`, so every comma was inside a comment and no
--    tuple was separated from the next. 255 of 256 rows carried the defect. The comma now follows
--    the closing paren and the comment follows the comma.
-- ⚠️ ALSO CHANGED: one row was removed as a duplicate — see 06-postcode-collisions.sql.
--    'The Bull' [Borrough Green] and 'The Bull' [Burrough Green] are the same pub on the same
--    postcode CB8 9NH with the same coordinate, differing only by a misspelt village. 🔴 They would
--    NOT have collided on the (name, village) unique key, so both would have imported.
--    postcodes.io gives the CB8 9NH parish as "Burrough Green"; that spelling is kept.
--
-- 🔴 COORDINATES: NOT the Sheet's. The Sheet's come from the Apps Script's unvalidated Google Maps
-- geocode (v6.57:368-374, :694-700, :1406-1410) — no postcode check, no gauntlet, no sentinel test.
-- Measured against postcodes.io on the rows where both exist: 141 of 177 are >1km from their own
-- postcode, 78 >5km, 6 >20km, median 4.1km. So bucket A takes the postcodes.io coordinate; buckets
-- B and C get NO coordinate. A venue with no coordinate is SAFE — the discovery feed maps
-- `venue.latitude ? … : undefined` and MapView pins only `venueLat && venueLong`, so the event
-- lists without a marker rather than getting a WRONG one.
--
-- 🔴 WHAT THIS DOES NOT DO: it links no event. discovery_events.venue_id is untouched; 2,229 rows
-- stay unlinked. Linking is scripts/backfill-venue-id.ts, run by hand, afterwards.
--
-- ids are pre-generated so 05-rollback.sql deletes exactly these rows and nothing else.
insert into venues (id, name, village, postcode, latitude, longitude, premium) values
  ('c6bb0b80-4eac-4843-a112-f056e7a2b536', 'The Bell Inn', 'Balsham', 'CB21 4DS', 52.133173, 0.316593, false),   -- A: postcodes.io
  ('4be59a60-ae16-4c6a-a31c-fc8bfd7be6e5', 'The Bull', 'Burrough Green', 'CB8 9NH', 52.174552, 0.393394, false),   -- A: postcodes.io
  ('7a9af923-5ba8-4414-ba57-ebe627b25c25', 'The Greyhound', 'Chevington', 'IP29 5QS', 52.201513, 0.607978, false),   -- A: postcodes.io
  ('b877af58-fb9a-424f-a021-84c85bd5d7d6', 'The King''s Head', 'Pebmarsh', 'CO9 2NH', 51.968973, 0.695745, false),   -- A: postcodes.io
  ('c1128911-9bc8-424e-90a9-4695b7fdf187', 'The Swan', 'Lavenham', 'CO10 9PZ', 52.108446, 0.795481, false),   -- A: postcodes.io
  ('da9fbcc2-6280-437c-a452-8c5f0cd40aef', 'The Street', 'Capel St. Mary', 'IP9 2EP', 52.003842, 1.049835, false),   -- A: postcodes.io
  ('dcfdcd6c-cf92-4aab-8cf2-0d68892ab20a', 'Meet Mike', 'Norwich', 'NR30 3PY', 52.583929, 1.733251, false),   -- A: postcodes.io
  ('ea131cc5-52da-4879-a0ba-49e04e1edb42', 'Lingwood England Football', 'Lingwood', 'NR13 4AZ', 52.621255, 1.490534, false),   -- A: postcodes.io
  ('65226420-e5fd-4fba-ad24-e8b135cb2774', 'Fordham British Legion', 'Fordham', 'CB7 5NJ', 52.311041, 0.391946, false),   -- A: postcodes.io
  ('36273842-5394-4422-930b-fd6e17bdb112', 'Fardons at The Swan', 'The Swan', 'NR13 3AA', 52.637569, 1.549537, false),   -- A: postcodes.io
  ('04bb9a81-d27e-44e2-bad3-81c6ebfcb9ab', 'Welwyn Garden City Town Centre Street Food Heroes', 'Welwyn Garden City', 'AL8 6TP', 51.803246, -0.206904, false),   -- A: postcodes.io
  ('3c695b26-c215-42d1-b3ed-e0f323adb33e', 'BAR HILL', 'CAMBRIDGE', 'CB23 8ES', 52.253222, 0.024624, false),   -- A: postcodes.io
  ('a58c00d8-92d4-4342-93ba-eea77e614a1c', 'The Jerk Chicken Man', 'Hertford', 'SG14 1BW', 51.796536, -0.077109, false),   -- A: postcodes.io
  ('6d6e8a87-1098-41a1-b4e7-e9f10acffa76', 'Hop Fields', 'Saffron Walden', 'CB11 3AY', 52.016683, 0.249821, false),   -- A: postcodes.io
  ('73d531d1-edf4-4e39-a5c4-d91aaa4e1b62', 'Crumble King of Northstowe', 'Northstowe', 'CB24 1EU', 52.279113, 0.062337, false),   -- A: postcodes.io
  ('b1333eb2-bfad-4028-b97a-857dcbab4947', 'Letchworth store', 'Letchworth', 'SG6 1AB', 51.988763, -0.219555, false),   -- A: postcodes.io
  ('104bf6a9-d2f0-41ad-8d91-7a1e4a5e204a', 'Banbury Show', 'Banbury', 'OX16 0AA', 52.060139, -1.339541, false),   -- A: postcodes.io
  ('d4e618d7-4e2f-4c82-a726-5be8b17acae6', 'Jesus Green', 'Cambridge', 'CB4 3BD', 52.21251, 0.120702, false),   -- A: postcodes.io
  ('62812dfd-f1c0-4425-93fd-a7fa092cdd55', 'Rainbow Rocket', 'Cambridge', 'CB1 7ED', 52.192868, 0.13927, false),   -- A: postcodes.io
  ('6e280b39-7d90-4836-a879-49a37fe04585', 'Smile Jamaica', 'NEWMARKET', 'CB8 0AA', 52.24757, 0.401394, false),   -- A: postcodes.io
  ('d4194de0-0dfc-4e61-84e1-0097e57e4fb6', 'EAT Street MK', 'Milton Keynes', 'MK1 1QB', 52.00701, -0.730974, false),   -- A: postcodes.io
  ('210d0ed7-1a0f-4823-a18a-449e0d191d6a', 'Street Food Heroes', 'Ashwell', 'SG7 5NX', 52.041388, -0.153802, false),   -- A: postcodes.io
  ('85fd5106-bf9c-4ee0-a5d1-987c557afd7e', 'Poss leave', 'Norfolk', 'NR1 1AA', 52.626674, 1.309363, false),   -- A: postcodes.io
  ('4e1e3c04-0028-45db-850d-3dc598546032', 'TBC Black Dog Music Project', 'Norwich', 'NR3 4DY', 52.651022, 1.309294, false),   -- A: postcodes.io
  ('c57ef5bb-ab19-4539-911e-ba7f19caad0e', 'Gosfield Village Fete', 'Gosfield', 'CO9 1PR', 51.927212, 0.592287, false),   -- A: postcodes.io
  ('45eb7582-c13a-40bd-a21e-a08bba7ccda3', 'Bures Music Festival', 'Bures', 'CO8 5JE', 51.974624, 0.776466, false),   -- A: postcodes.io
  ('9d8ec912-b66f-43b8-ab83-e380ac7b5bda', 'Kings Forest Car Park', 'Bury Saint Edmunds', 'IP28 6UT', 52.33089, 0.681562, false),   -- A: postcodes.io
  ('0e987839-8596-4191-af58-c0aeeda5e7d2', '48 Clifton Road', 'Cambridge', 'CB1 7ED', 52.192868, 0.13927, false),   -- A: postcodes.io
  ('ad540288-99a2-4b47-be44-3d6f49b351ce', 'Newton Flotman Social club', 'Newton Flotman', 'NR15 1RF', 52.537669, 1.255993, false),   -- A: postcodes.io
  ('5d76c37c-c618-47d0-ae9b-8773eefc36b6', 'Trowse village fete', 'Trowse', 'NR14 8AX', 52.557847, 1.236135, false),   -- A: postcodes.io
  ('08316fdd-c445-46e6-9677-9414ea262c7c', 'Father''s Day', 'Haverhill', 'CB9 7AA', 52.071146, 0.435504, false),   -- A: postcodes.io
  ('186a7292-32a7-4497-903a-1eb9824940e4', 'The Live Lounge', 'Stowmarket', 'IP14 1BB', 52.185487, 0.999517, false),   -- A: postcodes.io
  ('bf0cd490-c294-4bc9-a9ad-327b05cecc4d', 'The Lounge', 'Stowmarket', 'IP14 1BB', 52.185487, 0.999517, false),   -- A: postcodes.io
  ('767a0f24-a07b-4167-85a0-176da4077666', 'Fairfield park', 'Stotfold', 'SG5 4FA', 51.997688, -0.246893, false),   -- A: postcodes.io
  ('cba9480e-d5f7-4c75-8b83-9c5635fbd86a', 'Sawasdee Melford, Nethergate Brewery & Distillery', 'Nethergate Brewery & Distillery', 'NR9 5SE', 52.721459, 1.108452, false),   -- A: postcodes.io
  ('78051496-3117-4f80-9f1b-742ab5fefe11', 'The Brickmakers', 'Norwich', 'NR3 4DY', 52.651022, 1.309294, false),   -- A: postcodes.io
  ('a6d4e301-e5c5-4d59-9b4e-e56fa34bc086', 'Prep for Armour fest', 'Ludham', 'NR29 5NY', 52.702094, 1.514576, false),   -- A: postcodes.io
  ('d6bd07e3-c1ba-49d6-90b5-e08a6bad4b2c', 'The Shannon Inn', 'Bucklesham', 'IP10 0DR', 52.030469, 1.268545, false),   -- A: postcodes.io
  ('87737727-74ea-49b1-879f-e1cc0924c5a6', 'Felixstowe Carnival', 'Felixstowe', 'IP11 2AU', 51.957656, 1.343603, false),   -- A: postcodes.io
  ('980e3af8-bd8a-4a06-8eb7-afc88c68493b', 'BTYFC Baldock Town Youth', 'Baldock', 'SG7 5AU', 51.99385, -0.196951, false),   -- A: postcodes.io
  ('e5cde832-c992-4395-90f5-d671be3681c2', 'Armourfest 26', 'Forncett St Peter', 'NR16 1HZ', 52.495275, 1.193225, false),   -- A: postcodes.io
  ('69829eb7-2a2a-4819-adf6-90bd5cbbed77', 'The White Hart', 'Campton', 'SG17 5PE', 52.029864, -0.356206, false),   -- A: postcodes.io
  ('7fc0524b-1792-4c5c-be7a-9ed25ca03f5d', 'Fen Edge Festival', 'Cottenham', 'CB24 8UA', 52.28251, 0.124804, false),   -- A: postcodes.io
  ('db047993-da87-4f22-b668-2bfb776ad131', 'Trinity College', 'Cambridge', 'CB2 1TQ', 52.206938, 0.117524, false),   -- A: postcodes.io
  ('07843024-1c1a-4c24-a9c5-07b234db2ec5', 'King''s Affair', 'Cambridge', 'CB2 1ST', 52.204343, 0.117268, false),   -- A: postcodes.io
  ('ff3eabd7-7660-40c8-96a6-6e73b93ec7f7', 'Stapleford Feast', 'Stapleford', 'CB22 5BG', 52.148914, 0.142761, false),   -- A: postcodes.io
  ('3b535e6c-096e-4daa-bb67-61b35cc4b33f', 'Hi Park Primary Summer Fair', 'Cambridge', 'CB1 3QW', 52.193699, 0.144065, false),   -- A: postcodes.io
  ('68942858-0e3c-4c24-94cc-8c706258e692', 'Black Horse Rampton', 'Rampton', 'CB24 8QB', 52.291195, 0.090657, false),   -- A: postcodes.io
  ('6b1e3b82-4045-4826-a40f-9b233512cec8', 'Histon and Impington Recreation Ground', 'Histon and Impington', 'CB24 9LU', 52.245511, 0.112621, false),   -- A: postcodes.io
  ('7cf2f184-8408-4e4e-8b97-4e2e3ddc266d', 'Wootton Community Centre', 'Wootton', 'MK43 9EJ', 52.078648, -0.529344, false),   -- A: postcodes.io
  ('f57199af-2e74-4c4d-9c4e-e7aca30e3617', 'Biggleswade Market', 'Biggleswade', 'SG18 8AL', 52.085043, -0.261967, false),   -- A: postcodes.io
  ('ba13d477-b319-457b-91a2-f9de431a7759', 'Tyres', 'Lingwood', 'NR13 4BG', 52.617504, 1.491772, false),   -- A: postcodes.io
  ('284b11ba-0669-4ea3-a94f-de83ae5e8806', 'Southery Village Hall', 'Southery', 'PE38 0NB', 52.526148, 0.384507, false),   -- A: postcodes.io
  ('17e09667-9575-4770-8104-8694eb7fd51d', 'Shuttleworth Festival of flight', 'Shuttleworth', 'SG18 9NY', 52.053972, -0.269604, false),   -- A: postcodes.io
  ('a2b291e1-4090-46b6-aa66-ebff7bfaa7ff', 'Village Hall and playing field', 'Newton Flotman', 'NR15 1RF', 52.537669, 1.255993, false),   -- A: postcodes.io
  ('b1e7d54f-b940-4420-bcf4-6719a4c92407', 'The Norfolk Tank Museum', 'Forncett St Peter', 'NR16 1HZ', 52.495275, 1.193225, false),   -- A: postcodes.io
  ('a414ce9f-c9ca-4bca-af63-e396a05d42f2', 'Little Thetford - Open Group', 'Little Thetford', 'CB6 1LX', 52.456107, 0.309436, false),   -- A: postcodes.io
  ('c99c34f7-e851-4e28-8c93-0b4db83a0978', 'Marham Park', 'Felixstowe', 'IP11 2XP', 51.961706, 1.322895, false),   -- A: postcodes.io
  ('b318b710-4d67-4b56-a986-b95f137bca69', 'Belchamp Community House', 'Belchamp', 'CO10 7BG', 52.044568, 0.626218, false),   -- A: postcodes.io
  ('5d1851b0-8990-4904-b1b2-42bb83fd943d', 'Relay for Life', 'Bury St Edmunds', 'IP33 3TU', 52.248405, 0.686811, false),   -- A: postcodes.io
  ('5e244ec1-acaa-49d2-a465-f4b5f0ae97a1', 'Rougham Estate Pumpkin Patch', 'Rougham', 'IP30 9LZ', 52.235429, 0.797815, false),   -- A: postcodes.io
  ('ecb47664-5bc3-4b64-80a4-7ba9da30ee3e', 'Milton Country Park', 'Milton', 'CB24 6AZ', 52.237163, 0.158039, false),   -- A: postcodes.io
  ('ff04ed8b-2214-40b1-b030-4c8e38cdba3b', 'Marky D''s', 'Norfolk', 'NR1 1AA', 52.626674, 1.309363, false),   -- A: postcodes.io
  ('c8225545-7ab0-4f25-ad78-914ff5bfb583', 'Todd In The Hole Festival', 'Todd In The Hole Festival', 'SG18 9DT', 52.085306, -0.300402, false),   -- A: postcodes.io
  ('d881b33d-3f63-471e-ac6a-c2f50ea463db', 'Chilfest', 'Chilfest', 'AL5 1AA', 51.811043, -0.33476, false),   -- A: postcodes.io
  ('30f2f195-2556-45c1-a20c-7bd281c5c0e0', 'Northstowe Town', 'Northstowe', 'CB24 1DB', 52.289656, 0.058472, false),   -- A: postcodes.io
  ('a0c33b0f-a073-4619-8021-b5be5c78e059', 'Zaket Potato', 'Norwich', 'NR2 3AA', 52.628105, 1.274085, false),   -- A: postcodes.io
  ('540a1edf-7f5e-4ef2-8fe2-b529edb5d0b3', 'King''s College Chapel', 'Cambridge', 'CB2 1ST', 52.204343, 0.117268, false),   -- A: postcodes.io
  ('2bbdfae1-bb87-4fc7-bf3d-63802a5257da', 'PIE Performance Porsche', 'Ipswich', 'IP1 5PB', 52.081085, 1.112673, false),   -- A: postcodes.io
  ('3a030e0a-a015-4347-a6d0-4afe9fe42ebf', 'THE MANGER', 'Bradfield Combust', 'IP30 0LW', 52.179298, 0.765237, false),   -- A: postcodes.io
  ('167c36e5-4cfd-48d9-96a3-4a4d0a21be37', 'Bailey Hills Vineyard', 'Wickham Hall', 'CM23 1JG', 51.886456, 0.140701, false),   -- A: postcodes.io
  ('4578c6ca-89f1-4a3e-abda-ccd21864c553', 'Ampthill Big Tent Weekend', 'Ampthill', 'MK45 2GU', 52.031511, -0.501924, false),   -- A: postcodes.io
  ('5ee51a5d-12f9-471e-89df-7aa597e88508', 'Rushden Party in The Park', 'Rushden', 'NN10 0RU', 52.292117, -0.598039, false),   -- A: postcodes.io
  ('4b79b026-2ec8-49b8-80bd-a9f2392c822d', 'St John''s College', 'Cambridge', 'CB2 1TP', 52.207777, 0.117827, false),   -- A: postcodes.io
  ('18fcb670-1539-4420-8a20-f34f9ef90238', 'Inclecboro Fields Campsite', 'West Runton', 'NR27 9QG', 52.935248, 1.24773, false),   -- A: postcodes.io
  ('ec98e21a-4441-42da-977a-4542f4284abf', 'Hadleigh high street', 'Hadleigh', 'IP7 5AP', 52.042122, 0.955279, false),   -- A: postcodes.io
  ('93a45e64-e4d4-4bda-854a-0611c5a49d54', 'Unit 8A, The Grip Industrial Estate', 'Linton', 'CB21 4XN', 52.093455, 0.272619, false),   -- A: postcodes.io
  ('ebdb014f-af72-4744-ba84-e47d27972e96', 'Culford Classic Car Show', 'Culford', 'IP29 5NX', 52.21472, 0.704, false),   -- A: postcodes.io
  ('5c63a617-6a9a-426d-9a18-e2ff489aea33', 'Dog Day Fairhaven', 'Unknown', 'NR32 4TT', 52.489878, 1.739272, false),   -- A: postcodes.io
  ('b8f092a7-fe4f-4c26-b664-39470cdf9169', 'Helmingham Gardens', 'Helmingham Estate', 'IP14 6EF', 52.174126, 1.196699, false),   -- A: postcodes.io
  ('be2dcccd-d870-4812-bc97-68abcf8f80cc', '8.55 appointment @ dr', 'Unknown', 'IP33 1EQ', 52.247302, 0.713761, false),   -- A: postcodes.io
  ('5607892f-6dc9-4108-a348-09531963b57b', 'No RWE', 'Unknown', 'NR13 3AA', 52.637569, 1.549537, false),   -- A: postcodes.io
  ('4a8f6531-aa7b-47f4-83f5-d0703aa497bf', 'Ranworth beer festival', 'Unknown', 'NR13 3AA', 52.637569, 1.549537, false),   -- A: postcodes.io
  ('85907e55-e89a-4728-8021-a4584aed6593', 'Ashdon Village Hall Car Park', 'Ashdon', 'CB10 2HB', 52.054212, 0.311921, false),   -- A: postcodes.io
  ('7c47f1a1-fa04-4236-b831-433ba2bc12f5', 'Cancer Research UK Cambridge Institute', 'Cambridge', 'CB2 0RE', 52.176902, 0.135578, false),   -- A: postcodes.io
  ('7832f80c-389c-4a40-8748-76464a4c38b3', 'Audley End Enchanted Railway', 'Audley End', 'CB11 4JB', 52.018884, 0.220548, false),   -- A: postcodes.io
  ('4497e9ae-cbc0-4e23-916c-e8f32f338336', 'White Hart Pub', 'Attleborough', 'NR17 1TP', 52.532021, 0.934632, false),   -- A: postcodes.io
  ('ed35f84f-7a19-41ed-b71e-348551b64480', 'FY Camp', 'Wendling', 'NR19 2LT', 52.673364, 0.861446, false),   -- A: postcodes.io
  ('ce2cbf35-094c-4610-b06a-353be39dea21', 'dr appointment', 'Great Yarmouth', 'NR29 5NY', 52.702094, 1.514576, false),   -- A: postcodes.io
  ('6dbda721-4871-4f30-906e-511d17f2db34', 'Incleboro Fields Caravan and Motorhome Club Campsite', 'West Runton', 'NR27 9QG', 52.935248, 1.24773, false),   -- A: postcodes.io
  ('640d2f6b-82b5-4c2f-8aff-615d4df0b77e', 'Estuary Park', 'Melford', 'CO10 9BB', 52.102367, 0.72325, false),   -- A: postcodes.io
  ('c7733230-c746-4826-9e6e-6f1a40cc34cd', 'Rookswood club', 'March', 'PE15 0PR', 52.5758, 0.080903, false),   -- A: postcodes.io
  ('251fbc4c-ad18-42b7-b721-df41e1f66659', 'Audley End Miniature Railway', 'Audley End', 'CB10 2XJ', 51.993875, 0.332672, false),   -- A: postcodes.io
  ('c83f045d-04fe-4da3-ab11-2dfd0277f1e1', 'Puckeridge Pony Club', 'Brent Pelham', 'SG10 6AJ', 51.847286, 0.068773, false),   -- A: postcodes.io
  ('27bc422d-632b-4c7c-a398-b9af34e1de17', 'Corporate Lunch', 'Haverhill', 'CB9 7XF', 52.068356, 0.474035, false),   -- A: postcodes.io
  ('e2ee3cac-4899-4f6c-b077-b738e81593e4', 'West Suffolk Classic Show', 'Haverhill', 'CB9 7XF', 52.068356, 0.474035, false),   -- A: postcodes.io
  ('66e0b5cb-5636-4811-b182-51dd1341d040', 'RHS Sandringham Flower Show', 'Sandringham', 'PE31 6PE', 52.864743, 0.511044, false),   -- A: postcodes.io
  ('7c81e63a-2510-4537-a512-42d9fdffc63a', 'Sandringham Estate', 'Sandringham', 'PE35 6EN', 52.826389, 0.516345, false),   -- A: postcodes.io
  ('eb0a232a-711f-4a52-bc91-a45818442130', 'Churro Boyz', 'Letchworth', 'SG6 1AE', 51.990448, -0.215061, false),   -- A: postcodes.io
  ('27157de7-df24-411c-b9d3-7ea8523a7633', 'Royal Air Force Day Event 2026', 'Ipswich', 'IP3 9QA', 52.035856, 1.192215, false),   -- A: postcodes.io
  ('856d1d52-edf8-41c8-8f0e-017c6dd173af', 'Down By The River', 'BURY ST EDMUNDS', 'IP33 2AA', 52.240095, 0.719415, false),   -- A: postcodes.io
  ('a551b251-c076-4bea-81f7-545d26ffd08d', 'BigDaySmallCountry Festival', 'Nayland', 'CO6 4AY', 51.989254, 0.89494, false),   -- A: postcodes.io
  ('6cbb4238-99af-4b15-b3d5-717af39ac5a4', 'Mid-Suffolk Light Railway', 'Mid-Suffolk', 'IP14 6NU', 52.241895, 1.166745, false),   -- A: postcodes.io
  ('cde76fe6-726d-45e0-ac95-cea3ee966467', 'The Framsden Greyhound', 'Framsden', 'IP14 6HG', 52.192389, 1.215703, false),   -- A: postcodes.io
  ('bd60768a-4f68-4b07-a5a2-df67ab75f70f', 'Great Blakenham Village Hall', 'Great Blakenham', 'IP6 0NJ', 52.115102, 1.093467, false),   -- A: postcodes.io
  ('67cd33dc-9035-4a9e-9f01-e7023f469652', 'Worlingworth Community Centre', 'Woodbridge', 'IP13 7HX', 52.269444, 1.253328, false),   -- A: postcodes.io
  ('90a59d2b-1b4f-4713-b577-63f196ba04cc', 'Jive Swing Festival', 'Watford', 'WD17 1BN', 51.661107, -0.400599, false),   -- A: postcodes.io
  ('d2bd480b-d570-4d92-893f-4ec93677cf36', 'Transit Mot due', 'Cromer', 'NR27 9HY', 52.930654, 1.29598, false),   -- A: postcodes.io
  ('db54f1ce-4224-4032-96b2-03c74d079f35', '46 Chesterton Rd', 'Cambridge', 'CB4 1EN', 52.21426, 0.126348, false),   -- A: postcodes.io
  ('578b76b1-226f-48da-a6cd-1626e73ba3ef', '135-163 Galton Rd', 'Cambridge', 'CB3 0UL', 52.224832, 0.099853, false),   -- A: postcodes.io
  ('7c7a5a9c-7b49-4fa4-8c0b-0f35314b907a', 'Brookside', 'Dalham', 'CB8 8TG', 52.226066, 0.520149, false),   -- A: postcodes.io
  ('19ab476f-467a-426b-a02d-9ddc59fa9357', 'Unit 2, Convent Drive', 'Waterbeach', 'CB25 9QT', 52.270805, 0.181848, false),   -- A: postcodes.io
  ('47f673c1-a930-410f-a81e-321b79b4c0fa', 'Gentleman Jacks', 'Acle', 'NR13 3DY', 52.638453, 1.547967, false),   -- A: postcodes.io
  ('a6bc2d89-fd14-4570-8207-c563478c06d4', 'Norfolk Broads Caravan and Motorhome Club Campsite', 'Ludham', 'NR29 5NY', 52.702094, 1.514576, false),   -- A: postcodes.io
  ('af9a0fb8-b5d8-469a-8b83-5ea987bb6a99', 'River Nights Event', 'Audley End', 'CB10 1JD', 52.023214, 0.241651, false),   -- A: postcodes.io
  ('007b2921-ae1b-4c81-b2a7-f7e3c7907029', 'Connaught Hall', 'Norwich', 'NR4 7UG', 52.622703, 1.219858, false),   -- A: postcodes.io
  ('35620e83-01f8-4b27-9674-fd3d5b9557af', 'music on the green', 'long melford', 'CO10 9LQ', 52.07396, 0.716135, false),   -- A: postcodes.io
  ('96927325-61da-42a2-bd07-fc202fba6f58', 'Rendlesham Campsite', 'Rendlesham', 'IP12 2SZ', 52.124187, 1.404916, false),   -- A: postcodes.io
  ('19e3e79d-1553-4234-b001-4244f38e7b0a', 'AFRICA ALIVE', 'Norwich', 'NR3 1AU', 52.63067, 1.296065, false),   -- A: postcodes.io
  ('88797bab-ffa5-45d4-980b-ddfabb2053ea', 'Cantly Fun Day', 'Cantley', 'NR13 3UF', 52.561584, 1.570506, false),   -- A: postcodes.io
  ('9d9a8635-bb81-463a-997f-b5fc332ace06', 'Salen', 'Salen', 'PA72 6JJ', 56.521104, -5.941077, false),   -- A: postcodes.io
  ('69883b63-1d6c-46a3-8df2-a0d1afea6c69', 'Mezzoforte', 'Cambridge', 'CB2 8AA', 52.189577, 0.131329, false),   -- A: postcodes.io
  ('b193fba9-3e44-4254-a326-e00231047b3d', 'Lord Nelson', 'Norfolk', 'NR1 1AA', 52.626674, 1.309363, false),   -- A: postcodes.io
  ('a4d36f34-e9e6-4d95-a960-0685f5e22974', 'Armour fest', 'Norwich', 'NR1 1AA', 52.626674, 1.309363, false),   -- A: postcodes.io
  ('a83b648e-b8b1-46ab-81b4-dfafee871d55', 'Beetle Juice Event', 'Jimmy Farm', 'IP14 1AA', 52.186371, 0.99766, false),   -- A: postcodes.io
  ('3942981e-b52a-4ca7-b427-fa9c64c82afb', 'Cambourne Cricket Pavilion', 'Cambourne', 'CB23 6FY', 52.220296, -0.065054, false),   -- A: postcodes.io
  ('ca915cad-55ce-42bc-a37e-b1d25f6c7109', 'Little Thetford Village Hall', 'Little Thetford', 'CB6 3HG', 52.365341, 0.245034, false),   -- A: postcodes.io
  ('1199aaf8-cc6b-4997-b52a-4d64e95f1839', 'Great Waldingfield', 'Great Waldingfield', 'CO10 2RW', 52.038263, 0.741896, false),   -- A: postcodes.io
  ('a6e96ed3-d053-400d-aaf1-2148ea353e1f', 'Body Funk', 'Cambridge', 'CB2 1TN', 52.205118, 0.116208, false),   -- A: postcodes.io
  ('4184c7c4-a3fa-4223-b5b5-a96792539fb9', 'Dog show', 'Norfolk', 'NR1 1AA', 52.626674, 1.309363, false),   -- A: postcodes.io
  ('923c9262-c639-4a45-a85b-41fa05523025', 'Sudbury Street Food Festival', 'Sudbury', 'CO10 2EU', 52.038163, 0.727599, false),   -- A: postcodes.io
  ('850d1701-2f96-499e-b8d8-781f3b25077c', 'Frog''s Farm', 'Sundowner', 'NR31 0FF', 52.607153, 1.718429, false),   -- A: postcodes.io
  ('c423f1f6-27f3-4f41-b7d0-77a139d2d825', 'Westerfield Horse Show', 'Westerfield', 'IP6 0AJ', 52.097693, 1.116868, false),   -- A: postcodes.io
  ('911bc8b0-452f-4c5e-be04-d70422a56765', 'Hylands Park', 'Chelmsford', 'CM2 8WQ', 51.711473, 0.435957, false),   -- A: postcodes.io
  ('dde32b0f-86f9-4b8f-a196-241d892069c7', 'Biomedical Campus Cambridge', 'Cambridge', 'CB2 0AW', 52.176792, 0.136685, false),   -- A: postcodes.io
  ('0b76394d-d3c4-4e6f-9d35-5b2a8373a95b', 'Bristol International Balloon Fiesta', 'Bristol', 'BS40 5TT', 51.366894, -2.700824, false),   -- A: postcodes.io
  ('1fece262-51f3-42ed-8678-0c483ae952ab', 'Hylands Estate', 'Chelmsford', 'CM2 8WQ', 51.711473, 0.435957, false),   -- A: postcodes.io
  ('706c0811-c562-4deb-9f36-790209231499', 'Dunstable', 'Dunstable', 'LU5 4HR', 51.885488, -0.514802, false),   -- A: postcodes.io
  ('14252b58-3d2d-4e17-991c-5b22df5543cb', 'Playbox', 'Cambridge', 'CB2 8AA', 52.189577, 0.131329, false),   -- A: postcodes.io
  ('b8793716-d964-4c1b-bf0f-473ac276c0f0', 'St Neots', 'St Neots', 'PE19 1AE', 52.228754, -0.269248, false),   -- A: postcodes.io
  ('900f0e34-8558-428c-9bdc-4298e478d0f3', 'The Orchard Gardens', 'Thetford', 'IP24 1BB', 52.416268, 0.744949, false),   -- A: postcodes.io
  ('d53de1a3-3011-4a37-baa6-1d6356e51c2b', 'Co ob Barking rd', 'Needham Market', 'IP6 8EQ', 52.14959, 1.056005, false),   -- A: postcodes.io
  ('42a9a45e-d0ef-4e67-986c-c1aa0284f9eb', 'The Bell Bar', 'Buxhall', 'IP14 3BU', 52.188941, 0.967514, false),   -- A: postcodes.io
  ('252d86ee-751f-47b7-baa2-a791809f475f', 'Lannock Farm', 'Hitchin', 'SG4 7JE', 51.93118, -0.232282, false),   -- A: postcodes.io
  ('300772e8-b1fa-4976-8af5-9e4ea67e71ff', 'Wootton Food and music festival', 'Wootton', 'MK43 9DU', 52.098533, -0.528355, false),   -- A: postcodes.io
  ('13df2037-aebe-402c-9b1f-034e2ef56525', 'The Green Barn Farm Shop', 'Cambridge', 'CB22 3AD', 52.164938, 0.161955, false),   -- A: postcodes.io
  ('a66afa33-6ec1-4ce5-bd61-1b1bc4196840', 'Hitchin Food Festival', 'Hitchin', 'SG4 9RU', 51.947521, -0.268729, false),   -- A: postcodes.io
  ('3988aeda-62f3-4c7a-be8a-fc08bff0f2d8', 'Moreton Hall Community Centre', 'Bury St Edmunds', 'IP32 7EW', 52.245213, 0.742641, false),   -- A: postcodes.io
  ('20c5134f-03ae-4525-85f8-f71b5ec11603', 'Ridgewell Village Hall', 'Ridgewell', 'CO9 4PT', 52.018842, 0.560693, false),   -- A: postcodes.io
  ('afc79179-b3b1-43b6-bda2-dc060ea254c8', 'The Royal British Legion, Fordham', 'Fordham', 'CB7 5NJ', 52.311041, 0.391946, false),   -- A: postcodes.io
  ('c7af1780-5292-4ee0-b448-af7075e34c56', 'Bury Food & Drink Festival', 'Bury', 'PE32 2AA', 52.702664, 0.684208, false),   -- A: postcodes.io
  ('a6b133fd-1b24-4a28-ad16-525a7372057d', 'Brecks Vineyard', 'Hockwold cum Wilton', 'IP26 4JN', 52.466738, 0.505412, false),   -- A: postcodes.io
  ('6058eac2-986f-4d4f-8efa-86d6799b6821', 'University of Suffolk', 'Ipswich', 'IP4 1QJ', 52.052374, 1.163356, false),   -- A: postcodes.io
  ('33c420c4-1fe4-46ed-a691-449485bcfebf', 'The Great Feast', 'Euston Hall', 'IP24 2QW', 52.373242, 0.786639, false),   -- A: postcodes.io
  ('9d41448d-cf9f-4eaf-85cc-17a13ff59e44', 'Christening', 'Thetford', 'IP24 1AA', 52.415029, 0.746828, false),   -- A: postcodes.io
  ('84151684-ee8c-44c9-8add-76e61407f1e6', 'Bennington Chilli Festival', 'Bennington', 'SG2 7DJ', 51.882825, -0.095299, false),   -- A: postcodes.io
  ('db32ee3e-adb2-4ff3-bf10-901968f5fd20', 'Ashwell Show', 'Ashwell', 'SG7 5NX', 52.041388, -0.153802, false),   -- A: postcodes.io
  ('04b73219-5e3e-4774-8182-4ec40cb9eec3', 'The White Swan', 'Bluntisham', 'PE28 3LD', 52.352608, 0.006725, false),   -- A: postcodes.io
  ('22aed94e-6727-4c30-a6a9-26de71eaf28f', 'Elmsfest', 'Elmswell', 'IP30 9GN', 52.239951, 0.780374, false),   -- A: postcodes.io
  ('547acd80-5714-43b0-82d7-f519ba0d8470', 'IVO Brewery', 'St. Ives', 'PE27 3LY', 52.345474, -0.057068, false),   -- A: postcodes.io
  ('ee383bcb-c1d7-4e07-951a-842f0a80b5e9', 'Cock Inn', 'Werrington', 'PE4 5AU', 52.623374, -0.275684, false),   -- A: postcodes.io
  ('fd88c8ff-f56c-4e5c-8b23-26db500887c2', 'freethorpe village hall', 'Freethorpe', 'NR13 3NX', 52.591992, 1.558018, false),   -- A: postcodes.io
  ('4e93003d-83f3-4e09-98eb-a3dd209b7775', 'Newton Flotman Quiz Night', 'Unknown', 'NR16 1QQ', 52.472607, 1.133528, false),   -- A: postcodes.io
  ('b1c4120a-92c6-4fbf-98cb-474e9fa0d103', 'BNatural Music Festival', 'BNatural', 'SW1A 0AA', 51.499842, -0.124638, false),   -- A: postcodes.io
  ('09311ba0-9a05-4820-96bd-1c2bb5b9bb68', 'foodPark Biomedical Campus', 'Langley', 'CB11 4SB', 51.990681, 0.091064, false),   -- A: postcodes.io
  ('ef3d4aef-1cbf-46ca-91e2-65e0f3789017', 'Big Olney Food Festival', 'Olney', 'MK46 4AA', 52.151982, -0.701908, false),   -- A: postcodes.io
  ('a71b24ac-515e-4d83-bf45-b38fb14e892c', 'alumasc water management', 'halstead', 'CO9 1JQ', 51.943124, 0.630661, false),   -- A: postcodes.io
  ('0e9cc2e2-b9b0-4974-9919-feaabc32a42c', 'east bergholt village summer fair', 'East Bergholt', 'CO8 7AA', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('552245f9-0211-49be-a77e-f7ef589a87c8', 'Suffolk Aviation Heritage Group', 'Great Cornard', 'CO10 0JU', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('44a353be-4884-4683-88c4-7c767403ee1b', 'Steak & Honour', 'Cambridge', 'CB2 3PH', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('aa7de98a-87f5-4aca-bec1-497f320059fb', 'CB1 Station Road', 'Cambridge', 'CB1 2JE', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('53b52a07-8abc-4936-a68f-888eb64232ca', 'Charity Music Festival', 'Hertford Heath', 'SG13 7LP', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('5a5915ee-6f4b-4310-b91b-a58b78c27b52', 'Brandon', 'Brandon', 'IP27 0', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('be8425af-f492-40d5-a917-922bcfb2238f', 'Holbrook', 'Holbrook', 'IP9 2', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('10a4ef1b-9f00-4e19-bfb3-e2d3872e19fb', 'Hilton Feast', 'Hilton', 'PE28 9', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('b54758c4-9ac9-4cf2-855f-9d8960db3bf6', 'Culford School', 'Bury St. Edmunds', 'IP28 6TG', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('dc56bb1a-07f4-43c2-9932-b158ed81601f', 'Rushbanks Farm Caravan and Camping Site', 'Bures', 'CO8 5HU', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('44e5c628-bb1f-4a08-a080-5930efe0e1c8', 'West Bergholt Cricket Club Juniors', 'West Bergholt', 'CO6 3BS', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('b4d2b392-772c-467c-af62-4b157d14e6fe', 'The Ship', 'Great Yarmouth', 'NR30 1DT', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('610e18c0-3652-4a40-a118-d2005818744a', 'The Gog', 'Cambridge', 'CB2 9HN', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('827ec158-a9b5-4151-9bef-80e170b9854d', 'The Cake Shed', 'Great Waldingfield', 'CO10 2QW', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('3f472677-905f-4d5c-b97e-d45051463a72', 'Eddington, North West Cambridge Development', 'Cambridge', 'CB3 0GA', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('8660719a-069f-4784-86fa-d56f0aafb526', 'Electric Paradise', 'Letchworth', 'SG6 1', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('863506c5-a3e6-4e6e-8f30-96bb6bd00663', 'Chalkstone Fun Day', 'Haverhill', 'CB9 0', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('5399945a-5850-4489-9dd9-63159d23e704', 'Shudy Rocks', 'Shudy Camps', 'PE14 0', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('6c4caf66-9df0-40ec-ae2e-b4ec3bc98c4f', 'Reggae Land', 'Letchworth', 'SG6 2HR', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('a1cf9ae6-0c6f-4224-a58a-24e771159c6a', 'Lochbuie', 'Lochbuie', 'PA71 6XU', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('37e83b50-5a8d-4bef-871d-838ad3ac3c12', 'Bunessan Show', 'Bunessan', 'PA69 6DZ', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('bcc83582-2d54-47b6-8e01-90b0a1eb7c52', 'Old Goat Brewery', 'Stansfield', 'CO10 2PF', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('960659a1-4fc8-4f59-98b4-7c1130e3f3ba', 'The Half Moon 1746', 'Felixstowe', 'IP11 7BD', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('5c15f6b1-d551-4725-8a29-196ff86d54b4', 'Camlife,Fulbourn', 'Fulbourn', 'CB21 5BQ', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('0b12e4ce-e764-45bf-9c2c-d392abd32836', 'Higher Life', 'BURY ST EDMUND’S', 'IP30 0PG', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('0f146bcc-0db3-4e61-9bcf-5329a6ad3074', 'Physio', 'Unknown', 'NR1 3AQ', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('5c0f7a36-3757-4864-b4c5-de181550c5a6', '10 Dereham Road', 'Norwich', 'NR2 4AA', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('5b07eeb6-ce83-4765-82b7-7bde7f69c269', 'Daisy’s Milk Shed', 'Cambridge', 'CB2 9HN', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('f8be7b8b-0b03-4fe5-bfd6-ebb2bbf5d12c', 'Ipswich Town FC Fanzone', 'Ipswich', 'IP1 3BG', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('d86d7986-ca37-4a74-9933-188c100ab5d7', 'Drina Bakes', 'Sudbury', 'CO10 2XL', null, null, false),   -- B: postcode UNRESOLVABLE - no coord
  ('b86f7d06-4cff-48cc-b474-f4b9a1465cc8', 'The Black Horse', 'Brent Pelham', null, null, null, false),   -- C: no postcode - no coord
  ('936f29ef-7b74-48ba-8cb2-56a6f6358898', 'Halo Car Park', 'Stowmarket', null, null, null, false),   -- C: no postcode - no coord
  ('b51b63b5-e5b0-4352-9f50-f6daf6314d2e', '@Fashionthriftsociety', 'Peck''nam', null, null, null, false),   -- C: no postcode - no coord
  ('dffe9ab2-88b6-4176-a9c1-1b8d9e42d32d', 'Crafty Bear Sip N Paint', 'Witham High Street', null, null, null, false),   -- C: no postcode - no coord
  ('d30349c7-84ca-43d8-9583-659aa59fd433', 'The Village Club Farcet', 'Farcet', null, null, null, false),   -- C: no postcode - no coord
  ('8b6459fd-923f-4adc-9d25-0084ffb2a147', 'Ramsey Neighbourhoods Trust', 'Ramsey', null, null, null, false),   -- C: no postcode - no coord
  ('a61e1e47-5efc-4d3a-b9d8-07863f576f4f', 'Ely Fest', 'Ely', null, null, null, false),   -- C: no postcode - no coord
  ('5f835b83-9768-4e15-b35b-af8ca973f153', 'George Iv', 'Sawbridgeworth', null, null, null, false),   -- C: no postcode - no coord
  ('f169b8a0-5260-41fd-a302-5fdca25b00e7', 'Naama African Kitchen', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('24525173-d075-44fc-9198-89250381c581', 'Authentic Turkish Kebabs', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('28659176-d431-40ea-8d47-5e05484bc978', 'Noodles, Bao Buns, Curries', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('ebfff523-c9ca-471b-b999-2e4e2a628977', 'Suffolk Spice Fusion Curries And Naan Wraps', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('09586a00-60df-4927-80e0-09746c90fe6c', 'Authentic Thai Food', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('ac8c77f6-bbef-4d2b-b104-5e7d0dbb84df', 'Jerk Chicken Loaded Fries', 'Edwardstone White Horse', null, null, null, false),   -- C: no postcode - no coord
  ('7ff71c0b-6254-40a3-b1bb-8ce500ec6a28', 'School Event', 'Milton Keynes', null, null, null, false),   -- C: no postcode - no coord
  ('4be3fd60-6ce1-4c3c-8daf-dfc6398cbd1d', 'Corporate Party For @Uk Power Network', 'Stratford', null, null, null, false),   -- C: no postcode - no coord
  ('6561045a-83a5-4972-b434-17385828df59', 'Unit 21 Wolseley Business Park', 'Oulton Broad', null, null, null, false),   -- C: no postcode - no coord
  ('9d135352-9741-46ae-8d75-f148ba2028d6', 'Zaket Trailer', 'Norwich', null, null, null, false),   -- C: no postcode - no coord
  ('8afcb37a-b208-4f6e-986e-024dd7e83cc9', 'Ely Arts Festival', 'Ely', null, null, null, false),   -- C: no postcode - no coord
  ('a0e8d0f0-6bfc-4a4e-a33d-3928fa0386d6', 'Felixstowe (Opposite Car Shop & Library)', 'Felixstowe', null, null, null, false),   -- C: no postcode - no coord
  ('82585a65-9fed-4ca8-9110-f57ad30a5272', 'Milton Foot Golf @Kinnerz Coaching', 'Milton', null, null, null, false),   -- C: no postcode - no coord
  ('4150a3c6-c224-448e-b15d-972fd7197ae9', 'West End Fete', 'Surrey', null, null, null, false),   -- C: no postcode - no coord
  ('a97cf907-97cf-4d7c-a22c-b592ea3836af', 'Highfield Academy Summer Fete', 'Ely', null, null, null, false),   -- C: no postcode - no coord
  ('f7359347-e6ae-4ac0-99d6-3e6afe8e8c38', 'Hadleigh Lay By At Beestons', 'Beestons', null, null, null, false),   -- C: no postcode - no coord
  ('11656b43-5902-47ca-b30a-2ef92f58614d', 'Belstead Arms, Ipswich Ip2 9qu', 'Ipswich', null, null, null, false),   -- C: no postcode - no coord
  ('bf4e2d10-222f-43c9-8b7c-6d778b010ddb', 'Festival Silver Street', 'Godmanchester', null, null, null, false),   -- C: no postcode - no coord
  ('4dea854c-13e1-4abe-b4df-e002dc639581', 'Festival Barford Road', 'Blunham', null, null, null, false),   -- C: no postcode - no coord
  ('684cb616-08a7-41c3-b471-f31abfed7f97', 'Soham Prom, Soham Village College', 'Soham', null, null, null, false),   -- C: no postcode - no coord
  ('7f5cfdbe-3de4-4dd1-af0c-2e0e5032436f', 'Chatteris Midsummer Festival', 'Chatteris', null, null, null, false),   -- C: no postcode - no coord
  ('0c71009e-9ad8-4cea-97cf-df894dbccdce', 'Dereham Town Football Club', 'Dereham', null, null, null, false),   -- C: no postcode - no coord
  ('d07d69d2-2f91-4116-b14d-397a5e52a167', 'Junior School', 'White Woman Lane', null, null, null, false),   -- C: no postcode - no coord
  ('ff6a2ec2-9984-45e7-93f2-0dddcc478fb7', 'North Motherwell', 'Motherwell', null, null, null, false),   -- C: no postcode - no coord
  ('ac578138-c944-4fd0-a939-7aa7e748101c', 'Old Forgewood & Forgewood', 'Forgewood', null, null, null, false),   -- C: no postcode - no coord
  ('278dfdb3-817d-4031-9402-74553b551070', 'Ascensos Motherwell (Car Park)', 'Motherwell', null, null, null, false),   -- C: no postcode - no coord
  ('e032432a-2b38-4da0-8167-773ff9920d12', 'Craigneuk (Behind Farmfoods)', 'Craigneuk', null, null, null, false),   -- C: no postcode - no coord
  ('791c845e-6f84-4ff2-bf3c-01fb7a14452e', 'Muirhouse (Beside Uppercrust)', 'Muirhouse', null, null, null, false),   -- C: no postcode - no coord
  ('20288b1d-3b6e-40b6-9f40-a6a3d03411e5', 'Torrence Park (Panton Ave)', 'Torrence Park', null, null, null, false),   -- C: no postcode - no coord
  ('b713542f-2d7c-4e58-9597-6379e3676590', 'Cambridge Botanic Garden', 'Cambridge', null, null, null, false),   -- C: no postcode - no coord
  ('4a180d00-a61e-4e6f-b088-4928f1b162ff', 'Krazy Horse Late Nights', 'Bury St Edmunds', null, null, null, false),   -- C: no postcode - no coord
  ('a4132928-a773-4c9b-9bd9-1866f5d89751', 'Nene Park, Peterborough- Nene Park Trust', 'Peterborough', null, null, null, false),   -- C: no postcode - no coord
  ('709496ad-3f17-4d31-9184-36c03dc39cfb', 'Gala Day Godmanchester', 'Godmanchester', null, null, null, false),   -- C: no postcode - no coord
  ('2468ea82-a2ac-4ab1-a2c8-b24b48214fa1', 'Picnic In The Park Godmanchester', 'Godmanchester', null, null, null, false),   -- C: no postcode - no coord
  ('dee93ee4-b02d-493f-a833-b7decb94e0c9', 'Long Road College Open Evening', 'Cambridge', null, null, null, false),   -- C: no postcode - no coord
  ('aae5a97c-9b71-4ecb-93d6-60fe24137647', 'West Hub Summer Party', 'Cambridge', null, null, null, false),   -- C: no postcode - no coord
  ('60c0a939-518f-4a09-9781-296ccd977cad', 'Stowmarket Food & Drinks Festival', 'Stowmarket', null, null, null, false),   -- C: no postcode - no coord
  ('74781535-072b-43cc-b0c0-5ec1f633d1b5', 'Clare- Platform 1', 'Clare', null, null, null, false),   -- C: no postcode - no coord
  ('ef3baa12-f5db-40a2-935c-7a4afce185da', 'Stowmarket Food Festival', 'Stowmarket', null, null, null, false),   -- C: no postcode - no coord
  ('73f74b92-b00b-45be-95b4-717e55de2df4', 'Isleham Gala', 'Isleham', null, null, null, false),   -- C: no postcode - no coord
  ('3b1ea1a6-3e97-4528-9b81-1d66d26c0d75', 'Shefford Market', 'Shefford', null, null, null, false),   -- C: no postcode - no coord
  ('d9d7d87c-0124-443b-8273-33db0f026d21', 'Felixstowe Charity Event', 'Felixstowe', null, null, null, false),   -- C: no postcode - no coord
  ('5a0f7b87-256a-4b9b-ba54-06d0fe01e036', 'The Waggon & Horses', 'Milton', null, null, null, false),   -- C: no postcode - no coord
  ('56911645-d2ad-4d3f-b373-f5594021d55e', 'Transit Mot', 'Unknown', null, null, null, false),   -- C: no postcode - no coord
  ('be2cf98a-744d-4a4e-b05f-9620e259f914', 'Haircut', 'Unknown', null, null, null, false),   -- C: no postcode - no coord
  ('b53cb7a7-7be6-4c5e-b275-d7d775407013', 'G’s Family Day', 'G''s Family Day', null, null, null, false),   -- C: no postcode - no coord
  ('68f08ba3-f3c7-48f2-9c20-ef25dcc129c6', 'Dionne visit', 'Unknown', null, null, null, false),   -- C: no postcode - no coord
  ('3f0f0c55-a50d-45d8-97df-36e34dc9388a', 'California Social Club', 'California', null, null, null, false),   -- C: no postcode - no coord
  ('a4a88944-0205-4989-ac33-5f5ded90146f', 'Little Wings Of Hope Event', 'Essex', null, null, null, false),   -- C: no postcode - no coord
  ('27d0f33f-0cb4-43c7-94a6-1fc64aef39e2', 'Hare And Hounds', 'East Bergholt', null, null, null, false)   -- C: no postcode - no coord
on conflict (name, village) do nothing;

-- Expect 559 + 255 = 814.
select count(*) as venues_after from venues;
