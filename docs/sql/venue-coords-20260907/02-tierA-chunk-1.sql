-- 02 — TIER A, chunk 1 of 3 — 18 UPDATEs.
-- Every one of these has a VALID postcode that AGREES with its own village (within 10km), so the new
-- coordinate is the postcode's own point from postcodes.io. Nothing inserts, nothing deletes.
BEGIN;
UPDATE venues SET latitude = 51.972411, longitude = 0.871720 WHERE id = '290ba571-a87b-4613-8eb5-1dd0fafdab3a';  -- Nayland Village Centre [Nayland] 0.6km  placeholder decimals
UPDATE venues SET latitude = 52.192913, longitude = 0.888303 WHERE id = '089c01d3-77ad-4f10-977e-bddc5ffe495b';  -- Grace Baptist Chapel [Rattlesden] 11.7km  placeholder decimals
UPDATE venues SET latitude = 52.282175, longitude = 1.028085 WHERE id = '2ca04dea-ac40-493c-a1f7-13d4479f7ca8';  -- Finningham Village Green [Finningham] 7.1km  placeholder decimals
UPDATE venues SET latitude = 52.323877, longitude = 0.448787 WHERE id = '112ded8f-83bd-48d4-934e-7e5d4294bd7e';  -- East View [Freckenham] 8.2km  placeholder decimals
UPDATE venues SET latitude = 52.316029, longitude = 0.780916 WHERE id = '7d83ce73-ee89-41be-b220-6d9752978bb7';  -- Village Hall [Troston] 6.7km  placeholder decimals
UPDATE venues SET latitude = 52.192770, longitude = 1.217575 WHERE id = '99dd7d4d-e6a6-4810-98b3-c0156520df3e';  -- Framsden Village Hall [Framsden] 1.3km  placeholder decimals
UPDATE venues SET latitude = 52.061659, longitude = 0.539448 WHERE id = 'a48dcb63-c9ed-4112-8c33-c8105184399f';  -- The Barn (Village Hall) [Stoke By Clare] 4.7km  placeholder decimals
UPDATE venues SET latitude = 52.019336, longitude = 0.242725 WHERE id = 'b57e0a3e-395c-4ab6-8962-8b3309a8f734';  -- The railway arms [Saffron walden] 0.7km  placeholder decimals
UPDATE venues SET latitude = 52.225293, longitude = -0.247362 WHERE id = '71fde9ee-34cd-4ebd-b5e8-a2ccbf81cdcd';  -- Wintringham Primary Academy [Wintringham] 1.2km  placeholder decimals
UPDATE venues SET latitude = 52.181771, longitude = 0.946437 WHERE id = '83f52d62-94d2-46e8-90d2-19ae635cbe18';  -- Great Finborough - The Pettiward Hall [Great Finborough] 7.6km  placeholder decimals
UPDATE venues SET latitude = 52.097873, longitude = 1.040492 WHERE id = '92bf7103-8fc8-4c32-9f17-e4224516f90a';  -- Somersham & District Community Shop [Somersham] 6.0km  placeholder decimals
UPDATE venues SET latitude = 52.314416, longitude = 1.270833 WHERE id = 'b94cf411-5df3-4940-aa19-2dc0eefd2228';  -- Stradbroke Community Centre [Stradbroke] 6.2km  placeholder decimals
UPDATE venues SET latitude = 52.224057, longitude = 1.432711 WHERE id = '738056a8-3976-4624-b6c7-1c3e256c1f36';  -- Sweffling Hut/ Village Hall [Sweffling] 14.5km  placeholder decimals
UPDATE venues SET latitude = 52.070875, longitude = 0.174465 WHERE id = 'a0616bee-1394-4d2f-a62e-448e8a08240a';  -- The Lion [Ickleton] 6.8km  placeholder decimals
UPDATE venues SET latitude = 51.283247, longitude = 0.041621 WHERE id = 'ea2ffa00-233a-42cb-8b6e-77f7fc10edff';  -- Titsey Brewery Festival [Tatsfield] 7.0km  7.0km from its own postcode TN16 2JU
UPDATE venues SET latitude = 52.253031, longitude = -0.076362 WHERE id = 'd2cafcae-e9fa-49e9-b164-fbacc5ead531';  -- Franks Farm [Elsworth] 5.5km  5.5km from its own postcode CB23 4EY
UPDATE venues SET latitude = 52.029914, longitude = 0.754726 WHERE id = '270bc88d-7586-4395-9f26-8348243d9f9c';  -- Acton Village Hall [Acton] 11.2km  11.2km from its own postcode CO10 0EU
UPDATE venues SET latitude = 52.336024, longitude = 0.784578 WHERE id = '73d58734-e547-427f-be38-af7adde68dbb';  -- Fornham All Saints [Fornham All Saints] 10.7km  10.7km from its own postcode IP31 1LS
COMMIT;

-- Expect 18 rows updated.
