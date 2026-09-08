-- ⚠️ NOT AN IMPORT. REVIEW ONLY — every line here is commented out.
--
-- The one provable duplicate ('The Bull', CB8 9NH, two village spellings) has ALREADY been removed
-- from 02-import.sql. This file lists the 16 remaining groups where two or more PROPOSED rows
-- share a postcode but have DIFFERENT names.
--
-- 🔴 I DID NOT COLLAPSE THESE AUTOMATICALLY, AND HERE IS WHY. A UK postcode is an AREA — it can
-- cover up to about a hundred addresses — so a shared postcode is not evidence of a shared venue.
-- "King's Affair" and "King's College Chapel" share CB2 1ST because they are both at King's; they
-- are not the same pitch. Collapsing all 16 groups would silently discard real venues that this
-- import exists to capture. Each group below carries my reading and a ready DELETE line: uncomment
-- the ones you agree with, run them AFTER 02-import.sql, and leave the rest.
--
-- ⚠️ Where the names differ only by spelling or wording, the two rows probably ARE one venue and my
-- recommendation says so. Where they name different things, it says that instead.

-- ── CB75NJ ×2 — 🔴 LIKELY ONE VENUE (names differ only by wording/spelling)
--      65226420-e5fd-4fba-ad24-e8b135cb2774  "Fordham British Legion" [Fordham]
--      afc79179-b3b1-43b6-bda2-dc060ea254c8  "The Royal British Legion, Fordham" [Fordham]
--    RECOMMEND: keep "The Royal British Legion, Fordham", drop the other.
-- delete from venues where id = '65226420-e5fd-4fba-ad24-e8b135cb2774';   -- "Fordham British Legion"

-- ── NR133AA ×3 — ⚠️ probably DISTINCT places sharing one postcode
--      36273842-5394-4422-930b-fd6e17bdb112  "Fardons at The Swan" [The Swan]
--      5607892f-6dc9-4108-a348-09531963b57b  "No RWE" [Unknown]
--      4a8f6531-aa7b-47f4-83f5-d0703aa497bf  "Ranworth beer festival" [Unknown]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── CB17ED ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      62812dfd-f1c0-4425-93fd-a7fa092cdd55  "Rainbow Rocket" [Cambridge]
--      0e987839-8596-4191-af58-c0aeeda5e7d2  "48 Clifton Road" [Cambridge]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── SG75NX ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      210d0ed7-1a0f-4823-a18a-449e0d191d6a  "Street Food Heroes" [Ashwell]
--      db32ee3e-adb2-4ff3-bf10-901968f5fd20  "Ashwell Show" [Ashwell]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── NR11AA ×5 — ⚠️ probably DISTINCT places sharing one postcode
--      85fd5106-bf9c-4ee0-a5d1-987c557afd7e  "Poss leave" [Norfolk]
--      ff04ed8b-2214-40b1-b030-4c8e38cdba3b  "Marky D's" [Norfolk]
--      b193fba9-3e44-4254-a326-e00231047b3d  "Lord Nelson" [Norfolk]
--      a4d36f34-e9e6-4d95-a960-0685f5e22974  "Armour fest" [Norwich]
--      4184c7c4-a3fa-4223-b5b5-a96792539fb9  "Dog show" [Norfolk]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── NR34DY ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      4e1e3c04-0028-45db-850d-3dc598546032  "TBC Black Dog Music Project" [Norwich]
--      78051496-3117-4f80-9f1b-742ab5fefe11  "The Brickmakers" [Norwich]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── NR151RF ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      ad540288-99a2-4b47-be44-3d6f49b351ce  "Newton Flotman Social club" [Newton Flotman]
--      a2b291e1-4090-46b6-aa66-ebff7bfaa7ff  "Village Hall and playing field" [Newton Flotman]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── IP141BB ×2 — 🔴 LIKELY ONE VENUE (names differ only by wording/spelling)
--      186a7292-32a7-4497-903a-1eb9824940e4  "The Live Lounge" [Stowmarket]
--      bf0cd490-c294-4bc9-a9ad-327b05cecc4d  "The Lounge" [Stowmarket]
--    RECOMMEND: keep "The Live Lounge", drop the other.
-- delete from venues where id = 'bf0cd490-c294-4bc9-a9ad-327b05cecc4d';   -- "The Lounge"

-- ── NR295NY ×3 — ⚠️ probably DISTINCT places sharing one postcode
--      a6d4e301-e5c5-4d59-9b4e-e56fa34bc086  "Prep for Armour fest" [Ludham]
--      ce2cbf35-094c-4610-b06a-353be39dea21  "dr appointment" [Great Yarmouth]
--      a6bc2d89-fd14-4570-8207-c563478c06d4  "Norfolk Broads Caravan and Motorhome Club Campsite" [Ludham]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── NR161HZ ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      e5cde832-c992-4395-90f5-d671be3681c2  "Armourfest 26" [Forncett St Peter]
--      b1e7d54f-b940-4420-bcf4-6719a4c92407  "The Norfolk Tank Museum" [Forncett St Peter]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── CB21ST ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      07843024-1c1a-4c24-a9c5-07b234db2ec5  "King's Affair" [Cambridge]
--      540a1edf-7f5e-4ef2-8fe2-b529edb5d0b3  "King's College Chapel" [Cambridge]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── NR279QG ×2 — 🔴 LIKELY ONE VENUE (names differ only by wording/spelling)
--      18fcb670-1539-4420-8a20-f34f9ef90238  "Inclecboro Fields Campsite" [West Runton]
--      6dbda721-4871-4f30-906e-511d17f2db34  "Incleboro Fields Caravan and Motorhome Club Campsite" [West Runton]
--    RECOMMEND: keep "Incleboro Fields Caravan and Motorhome Club Campsite", drop the other.
-- delete from venues where id = '18fcb670-1539-4420-8a20-f34f9ef90238';   -- "Inclecboro Fields Campsite"

-- ── CB97XF ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      27bc422d-632b-4c7c-a398-b9af34e1de17  "Corporate Lunch" [Haverhill]
--      e2ee3cac-4899-4f6c-b077-b738e81593e4  "West Suffolk Classic Show" [Haverhill]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── CB28AA ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      69883b63-1d6c-46a3-8df2-a0d1afea6c69  "Mezzoforte" [Cambridge]
--      14252b58-3d2d-4e17-991c-5b22df5543cb  "Playbox" [Cambridge]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

-- ── CM28WQ ×2 — 🔴 LIKELY ONE VENUE (names differ only by wording/spelling)
--      911bc8b0-452f-4c5e-be04-d70422a56765  "Hylands Park" [Chelmsford]
--      1fece262-51f3-42ed-8678-0c483ae952ab  "Hylands Estate" [Chelmsford]
--    RECOMMEND: keep "Hylands Estate", drop the other.
-- delete from venues where id = '911bc8b0-452f-4c5e-be04-d70422a56765';   -- "Hylands Park"

-- ── CB29HN ×2 — ⚠️ probably DISTINCT places sharing one postcode
--      610e18c0-3652-4a40-a118-d2005818744a  "The Gog" [Cambridge]
--      5b07eeb6-ce83-4765-82b7-7bde7f69c269  "Daisy’s Milk Shed" [Cambridge]
--    RECOMMEND: keep both — a shared postcode is not a shared venue.

