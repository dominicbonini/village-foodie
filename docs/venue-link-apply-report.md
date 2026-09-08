# Applying the High-Confidence Venue Links

**7 September 2026 · the SQL for you to run · I applied nothing**

**Marking.** 🔎 source-read · 🧪 executed. 🔴 **Every call I made was a `select` or a `postcodes.io` lookup. I wrote nothing to the database.** The blocks below are for you to paste; I have not run them.

⚠️ **Premise flagged:** the prompt states 24 modified / 78 untracked. 🧪 The tree is **26 modified / 82 untracked** — the drift is entirely my own earlier work in this workstream (`lib/venue-matcher.ts`, `components/dashboard/types.ts`, `scripts/geo-validate.js` and four reports). No unknown change; no workstream disturbed.

---

## 🔴 THE HEADLINE: 312 STATEMENTS, NOT 325

You asked for the 325 high-confidence links. **13 of them are held back**, because Task 3 asked what happens when a correct link points at a badly-geocoded venue — and 7 target venues fail an independent coordinate check. A correct link to a wrong venue is still a wrong pin, so those 13 are excluded from the block below and listed for you separately.

| | |
|---|---|
| High-confidence links emitted | 325 |
| 🔴 Held back — target venue has bad coordinates | **13** |
| **In the block below** | **312** |
| Low-confidence links included | **0** |

---

# TASK 1 — WHAT YOU ARE ABOUT TO RUN

## 1.1 Statement count and rows affected

🧪 **312 statements, in 5 chunks** (65 / 65 / 65 / 65 / 52). Each affects **exactly one row, or zero**.

Zero is possible and is not a failure: every statement is guarded `AND venue_id IS NULL`, so re-running a chunk that already succeeded updates nothing. 🧪 I verified against the live table that **all 312 targets currently have `venue_id IS NULL`**, so on a first run each statement affects exactly 1 row and the total is **312 rows**.

🧪 Also verified: **0 of the 312 target events have a date in the past**, and **0 target venues have NULL coordinates** (a link to a coordinate-less venue would buy no pin).

## 1.2 Every statement writes `discovery_events.venue_id` and nothing else

🧪 Reduced all 312 statements by replacing UUIDs with a placeholder and taking the distinct set. **Exactly one shape exists:**

```
UPDATE discovery_events SET venue_id = <UUID> WHERE id = <UUID> AND venue_id IS NULL;
```

🧪 `SET` appears **312 times, always `SET venue_id`** — no other column. 🧪 Grepping the block for `venues`, `trucks`, `truck_events`, `discovery_trucks`, `excluded_terms`, `scraper_run_log` as whole words returns **zero matches**. **No statement touches `venues`, `trucks` or `truck_events`, so there is nothing to stop for.**

## 1.3 🔴 No low-confidence link is present — verified by identity, not by count

A count check would only prove the totals add up. Instead:

1. 🧪 **Independent re-derivation.** I parsed each statement's `(event_id, venue_id)` out of the file, re-read that event from the database, and re-ran `findVenue` myself. **325 of 325 re-derived as `high` with the identical venue id** — 0 re-derived as not-high, 0 re-derived to a different venue, 0 event ids missing. The generator's output and an independent recomputation agree row for row.
2. 🧪 **Set-difference on ids.** I computed the full low-confidence id set from the database (**243 ids**) and intersected it with the 312 ids in the block. **Intersection: 0.**
3. 🧪 **Held-back overlap.** The 13 held ids intersected with the 312: **0**.

*Failure mode if this proved nothing:* if I had re-derived using the SQL file as input rather than the database, the check would be circular. The re-derivation reads `venue_name`/`village` from `discovery_events` and recomputes the match from `venues`; the file supplies only the ids being checked.

## 1.4 Would any statement overwrite an existing non-null `venue_id`?

🧪 **No — none.** All 312 targets currently have `venue_id IS NULL`. Two independent protections: the measured fact above, and the `AND venue_id IS NULL` guard in every statement, which makes overwriting impossible even if a row changed between now and when you run it. **There is nothing to hold back on this ground and no separate list is needed.**

---

# TASK 2 — REVERSIBILITY

## 2.1 🔴 RUN THIS FIRST, BEFORE ANY CHUNK

Captures the current `venue_id` of every future event — a superset of the 312, so it covers the held-back rows and anything else that might move later.

```sql
CREATE TABLE IF NOT EXISTS venue_link_backup_20260907 AS
SELECT id, venue_id, event_date, truck_name, venue_name, village, now() AS captured_at
FROM discovery_events
WHERE event_date >= CURRENT_DATE;

-- Confirm it captured the expected shape before you go further.
SELECT count(*) AS rows_captured,
       count(venue_id) AS already_linked,
       count(*) - count(venue_id) AS currently_null
FROM venue_link_backup_20260907;
```

🧪 **Expect `rows_captured` 669, `already_linked` 69, `currently_null` 600.**

## 2.2 How to undo, if it comes to that

```sql
UPDATE discovery_events e
SET venue_id = b.venue_id
FROM venue_link_backup_20260907 b
WHERE b.id = e.id
  AND e.venue_id IS DISTINCT FROM b.venue_id;
```

This restores every row to exactly what the snapshot holds — it does not assume the links were the only change, and it is idempotent. 🔎 Because every captured row was `NULL` for the 312, the effect is to set them back to `NULL`. Drop the table only once you are satisfied: `DROP TABLE venue_link_backup_20260907;`

## 2.3 Before-and-after verification

**Run this BEFORE the chunks:**

```sql
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;
```

🧪 **Measured now: `future_events` 669, `with_venue_id` 69, `pinnable` 69.**

**Run the identical query AFTER.** Expect `with_venue_id` **381** and `pinnable` **381** (69 + 312).

⚠️ **381, not 394.** My previous report said ~394 from 325 links; holding back 13 makes it 381. If you see 381, that is the correct number.

---

# TASK 3 — THE THINGS THAT MUST HOLD

## 3.1 No applied link changes a pin for a trading truck — verified now, not cited

🧪 Verified fresh against the live database in this task, not carried over:

- **Trading trucks** — queried `trucks WHERE is_customer AND active AND NOT excluded`: **`pizzeria-gusto`, `real-thai-food`**.
- 🧪 I matched every one of the 312 statements' `truck_name` against those two by normalised name. **Pizzeria Gusto: 1 statement** (19 September, `Nethergate Brewery` → `Nethergate Brewery [Long Melford]`). **Real Thai Food: 0.**
- 🧪 I then simulated the public feed's own gate rather than assuming it: `discovery_trucks` for "Pizzeria Gusto" has **`excluded = true`, `show_on_vf = false`**, and 🔎 `app/api/discovery/events/route.ts:148` drops an event whose truck row is `excluded`. **The event stays hidden.**
- 🔎 Structurally: every statement writes `discovery_events.venue_id`. A trading truck's public pin comes from **`truck_events`**, which no statement touches.

*Failure mode if this proved nothing:* checking only `truck_events` would miss the discovery shadow entirely, and checking only the shadow's existence without reading `excluded`/`show_on_vf` would not establish invisibility. Both were read.

## 3.2 The three named mislinks — searched in the block itself

🧪 Searched the generated SQL text, not the generator's report:

| Searched | Occurrences in the block |
|---|---|
| `The White Swan` · `The Swan` | **0** |
| `Wine-Boutique` | **0** |
| `Busy` | **0** |
| `The Bull Pub` | **0** |
| `Troston` | **0** |

⚠️ Two names *do* appear, and both are legitimate — I checked each rather than assuming:

- **`Village Hall` — 10 statements, 4 distinct links, 0 targeting Troston.** Three are exact village matches (`Hundon → Hundon`, `Sewards End → Sewards End`, `Lingwood Village Hall Karaoke → Lingwood`); one is coarse (`Lingwood Village Hall [Norwich] → [Lingwood]`, 13.4 km, inside the 15 km ceiling). *(One of these, Sewards End, is separately held back in 3.3.)*
- **`Perky Beans` — 28 statements**, all to `Wintringham Plaza [Wintringham]` (26) and `Hinchingbrooke house events [Hinchingbrooke]` (2). 🧪 **Zero point at Saffron Walden's Bull Pub.** *(The 2 Hinchingbrooke ones are held back in 3.3.)*

## 3.3 🔴 An event whose venue row has bad coordinates — and what I held back

**What happens: the link is right and the pin is wrong.** The event gains a `venue_id`, the map join succeeds, and the marker is drawn at the venue's stored coordinates. Nothing downstream re-checks them. That is strictly worse than no link, because an absent pin is visibly missing whereas a wrong pin looks correct.

⚠️ **The village-anchor check in the matcher could not find these.** It measures a venue against the median of *other venues in the same village* — so a village holding exactly one venue anchors to itself and scores 0 km. 🧪 That is precisely why the anchor check reported **0** bad targets while the checks below found **7**: `Hinchingbrooke` has one venue, and it is the one that is wrong. **I would have shipped those 13 had I trusted it.**

🧪 So I re-checked all 65 target venues against three independent signals — placeholder decimals, the sentinel set, and `postcodes.io` (each venue's own postcode, and its village centroid):

| Events held | Venue | Stored | Why |
|---|---|---|---|
| **6** | Ludham bridge [Ludham] | 52.675, 1.625 | **8.2 km** from its own postcode NR29 5NX |
| **2** | Hinchingbrooke house events [Hinchingbrooke] | 52.37, 0.2 | **76.8 km** from postcode PE20 3RW; **27.4 km** from the Hinchingbrooke centroid |
| **1** | Auto Shack at the Corner Garage [Shotley] | 51.9789, **1.2345** | placeholder decimals |
| **1** | Martlesham Leisure [Martlesham Heath] | 52.0789, **1.2345** | placeholder decimals |
| **1** | Sewards End Village hall [Sewards End] | 52.0708, 0.2715 | 5.6 km from postcode CB10 2LG |
| **1** | Pidley Community Centre [Pidley] | 52.4709, −0.0009 | 10.2 km from postcode PE28 3DA |
| **1** | Wylde Sky Taproom [Linton] | 52.1799, 0.2599 | 9.7 km from postcode CB21 4XN |

**13 statements held back. They are not in the block below.** They become applicable once those seven venues are corrected — that is the venue-correction step, not this one.

---

# TASK 1 (continued) — THE SQL

🔎 Chunked per the manual's standing rule: *"A full-file paste into the SQL editor can silently run nothing. Run large migrations in CHUNKS and verify each."* Each chunk is its own transaction. **Run them in order, and run the row-count check after each.**

After every chunk, the editor should report the number of rows updated. Chunks 1–4 should each report **65**; chunk 5 should report **52**.

## Chunk 1 of 5

```sql
-- CHUNK 1 of 5 — 65 statements
BEGIN;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '7b110d58-34eb-4c0e-81a8-ef5ee7a1ec7c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = '2a1638ce-1350-4e9d-a484-0e61dcb95af5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = '07178a36-3a89-423a-b673-5982f5e9b333' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'c8b41ed4-62a1-4731-9b55-a5b32ba3af7a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '2b4423ef-d9cb-404a-bd12-f212a86629fe' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = '3ec0c857-fa6f-4a0f-b44a-daa8c792db77' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6eae1c19-d86d-4081-b473-920927c56e81' WHERE id = 'e6321aea-6de1-49ad-a429-ba8dbaac54b5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5ca087d2-4631-424c-a34b-26d8f8e30fda' WHERE id = '62388194-8f0f-4fa3-9aa4-2131700f71a3' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ea19437c-e035-47e4-9931-c87d0acb14af' WHERE id = 'ab06f9be-4bfc-4dde-ac63-bc637d8076cf' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '2e52cfb8-899e-4ee4-bd0d-c5a5c9c19e56' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '4588dc37-eb54-4c3c-bedd-89c4db6ed36a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = '38bea95c-63cc-47e3-806e-7dfbc415f429' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '20f6e087-c7a2-4eb4-adc4-bca6060aa0eb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a1bad847-9e24-42a5-a594-f1c3c52806a6' WHERE id = '334455ac-1fdf-45c8-8a27-d3a3deffbe28' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6b60aba3-0d7c-497c-a85d-fc0dd081a974' WHERE id = 'bf2c0d2b-676d-45e4-87d0-345dd0af1beb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '02ec04fa-9ca6-4552-91f9-4b213b36a0e3' WHERE id = '6bd2bdef-5ab4-4cbd-afec-6b090300ddbb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '5fc6bc68-a1e7-4955-b151-3e8c4d523a64' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '863eaeed-db08-46b8-aa9c-c9c8d25b0fb8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = 'cd94b9d9-ee41-4ed1-990c-24bc6baf3b60' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = '603a6b5a-959b-44d3-b113-7399dd6cae94' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = '9279b30d-b54a-41e4-9a43-2e6995ca3a9a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'f3cfcd7a-221e-4809-bd78-301479ce15c4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = 'ee8bab63-9970-4a30-919c-d99ab7fee00b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '38e00bd7-51d6-4f7f-822f-f7b8e29e1d9c' WHERE id = '612756da-0a10-4860-8429-ee20cea4f5a0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'adeca7cc-0241-46e2-96f2-568c68932342' WHERE id = '907de226-b319-4459-bf8c-c572ddc3a7ad' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = 'be6dcc57-aac4-4143-a8fd-02a50a74b4e9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '2d174036-0ece-4f00-9328-229d021f309a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '49a7fd0c-8b14-462c-b2e0-bf1c0535a072' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '8d88f9e9-e865-4c16-8e53-dd439cec35e2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = 'afcf4354-4f6e-41e3-8982-60ea96c4d946' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '0055f911-9d6c-4068-b946-e08a3016687a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'b884adfc-d8bc-4aca-a11f-164a0a16ed64' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1c44311e-8451-4f61-8e99-6c4b730e7b9b' WHERE id = 'e11e7bb2-956b-462a-8c33-6a8798170559' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1c44311e-8451-4f61-8e99-6c4b730e7b9b' WHERE id = '40a15e97-b049-4b8f-b98c-c6ddd8590435' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1c44311e-8451-4f61-8e99-6c4b730e7b9b' WHERE id = 'd23bc285-3202-4868-82c6-ad7a4b5f611e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1c44311e-8451-4f61-8e99-6c4b730e7b9b' WHERE id = 'bf8f58ee-3680-41d0-a2a7-0aa167e48ec9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1c44311e-8451-4f61-8e99-6c4b730e7b9b' WHERE id = 'd110d385-fb25-4fc4-b37e-136eb51a6a6b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = '5f8f9d76-9ab3-41f2-bc23-a4df6cde8558' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = '39996f73-8969-497c-9493-f1ebcc7f79f8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = '6c891367-7d84-4323-95dc-13a4235b6ee2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = '7a0781f0-8f17-4c34-bc41-1f77e9114537' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = '4f5dd5d4-1359-4b71-b75c-228ae23367e1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'e9995689-e367-4088-9201-39caa3a4e150' WHERE id = 'cf4c4314-6005-4817-b9ad-b0aa36d8e361' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'adeca7cc-0241-46e2-96f2-568c68932342' WHERE id = 'bc0ce64e-04fb-4a85-947e-7b31d394cf57' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '272f1dd1-bc9b-4c0c-b062-7530f65e0d9d' WHERE id = '53f3ee38-4fa5-4488-a355-b9423fc149a1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c1c940-8d2c-40ca-8b17-6d6992390e59' WHERE id = '441be646-c6c7-4732-9043-eaa97b0ffe8f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = '049c50da-a34b-47b6-8961-2878953b3b2f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2671320f-2613-428c-b730-7a90778db2fd' WHERE id = '8b6f32c9-8967-4033-9584-6185aa5581b4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = 'db4601fb-e909-4aa3-af52-e3085a74166c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = 'd0a413c0-068b-4156-9140-48dca838dba4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '3fbce27c-22cb-4858-b029-742b8dd837a3' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'be8fcc50-5543-4187-b21b-6fc0f0d136e4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'dcb7ced1-d7e4-4e93-9cc8-58f261bd6485' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'e28c6dc0-6ff4-4628-8d90-d064388ebcf9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = 'cbecc15b-855f-424a-baff-822719eb86e2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6e23389e-4d1c-405b-be22-7cc39bbd558f' WHERE id = '45dac1a1-a164-4c12-8e75-aafe355e693e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ea19437c-e035-47e4-9931-c87d0acb14af' WHERE id = '46ca91f0-1257-4ae9-a86d-dead36e7ddde' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb48034c-6797-4819-ba42-d9a752d92c42' WHERE id = '2e078069-7d76-43e0-bf70-de5e6b520b01' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c1c940-8d2c-40ca-8b17-6d6992390e59' WHERE id = '66f42f2a-498d-4c28-a9f7-8c02806b4a9c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'adeca7cc-0241-46e2-96f2-568c68932342' WHERE id = 'b756fec3-4ca3-495f-86e2-935d0173b123' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '272f1dd1-bc9b-4c0c-b062-7530f65e0d9d' WHERE id = '56fa687f-e15e-4e8f-a0a2-c11aded72f40' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '091e13dd-63a7-4f2b-8371-ba776a5465bf' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '645b7f3c-ec0d-442e-835a-d5973fcf168c' WHERE id = 'af00444a-16d8-4e14-a71e-6e62a43da3b4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '099138ac-7a19-4914-8327-eef5576b5636' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = '49c7a59d-3965-4c2d-b6c3-5bca61480460' AND venue_id IS NULL;
COMMIT;
```

## Chunk 2 of 5

```sql
-- CHUNK 2 of 5 — 65 statements
BEGIN;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '61f7c280-83de-4eac-9131-2fd811728849' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '8cdce185-19e1-49d8-8a13-d94fa45c23fa' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '51540f6e-d173-4b5b-a446-5c17f2ba0aff' WHERE id = '79dddbb4-73e0-4bd0-88a2-3659ed4bdc3b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = 'f3e060e1-57bc-48e0-9a8c-b42d68b92812' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = '6df8762d-5352-4b71-becf-8bc983a092f4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = 'de6d5065-6d3a-4e12-9cac-a2e95121bd2e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '190e12bb-25eb-4306-895f-1bbe6e58c3e8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '970b30f5-199f-458c-8487-be2cbfc8e170' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = 'fe3cb149-68e2-42a6-b267-12b6844192eb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '1d9f0c61-aa81-4cbf-bfa7-386339732e94' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = 'c67dd9ee-f0e0-4085-86ed-95f032c5f668' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '296970f7-fa4c-4cb3-bf41-bf8369a1c66b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = 'be3577e7-9269-4858-9388-37a7ee436609' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6801c48d-52c7-4cf4-a1bb-b13718fb8e7e' WHERE id = '8e0b3b5c-94df-4d41-9145-62eeefe09475' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '720b55f1-1ba3-473d-a60a-0dcbf4d038fd' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = 'a9c51d59-1da7-4c18-99ac-2f0b8b0baf48' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = '3cc524fe-024e-478e-be2f-96ecba900295' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '0821a909-70a0-4d99-8bb2-f10f78ac4942' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = 'b24ee9c8-1151-4651-b08c-47c42489d563' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9ea17313-f68d-4193-a897-4f5a02a87356' WHERE id = 'c9cbdff5-ff8d-45df-8c13-264b0c8bd040' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '38e00bd7-51d6-4f7f-822f-f7b8e29e1d9c' WHERE id = 'acd58c6b-5223-43aa-a949-532ab4a6b8fc' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '40143866-42dc-4a8d-a81b-4cc05422d590' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = 'af993514-5fe5-44fa-a753-9b3790ec8081' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '26b4cc7c-48ec-42b6-a852-014b54cdf494' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = '26f7ef1b-4763-466b-ba74-d5f42c130f21' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '97b950b3-469a-433f-bbce-65d123370800' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '450359d5-08b6-49cf-af94-b93e5cee9d5f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = 'dc4cf376-d904-4e23-a99b-4be07fca3739' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '71ab01f8-74b2-409c-b932-0bbaae243d12' WHERE id = '932d0e7d-c545-4fd7-8049-a33b5d5ec631' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9f9ee273-984b-4afe-b915-abfef0823883' WHERE id = 'a1d31c91-fba1-4d23-be11-49be2a11b40b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4bd9cf44-7ed1-4227-ac69-ba38390ba0f8' WHERE id = 'fe3bd242-9f76-4682-a6b3-34d51b188366' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = '2634f8e6-a553-481c-8e69-fc7cca9127ec' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '2bbbc4b3-7f8e-438d-93f5-49337775a68d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '9f3a74f9-7dfe-4428-82b1-9a6086270c9c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'a5924f7b-aefe-4590-8ad3-cfb66b7a58e6' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '62833386-bc0e-4d02-8438-f767b021bbd6' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '621921d1-c6d1-43af-a679-afcc0c2ba24c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = '464991af-3bd7-4db3-8422-eda7e11ec0e7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '7a74d84c-2ce8-42c0-b15c-5fb5e09d38a7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '36e90422-f126-4928-91ff-8e121ccb4cea' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = 'a0c84aba-fe20-473c-b306-00a183542087' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = 'ee1a2633-0e95-4d25-afbd-dca39e303ab0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b0898490-4456-4277-b484-424c0c6703d9' WHERE id = 'ef5b6653-d7ff-4be7-8aab-fc5a9835f11e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5fc1c752-dd20-40d4-84c7-a3f3ab439fee' WHERE id = '5db223ff-977d-45d1-bce1-d7ca7e668888' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = 'c6d195b6-acdb-4743-92ff-a48fbfeb47fc' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = 'b4d2b34c-520c-48cc-8a3d-8332dce692d8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '6a66e162-4ea0-4441-b667-1c39c9cdadf0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'e1972551-9147-4005-ab19-ada90a23df6d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = '2dc53804-7f65-417e-bd41-c907d946e659' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2547cf9f-4fe0-493e-9620-fef111102ecb' WHERE id = '1831a720-62c2-4e3e-ba3e-3eb1206e9f23' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2348775-55ff-4353-ab43-cacea3c62b85' WHERE id = 'ed965a36-d127-4893-9924-e961245c339d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '895b62b6-efc4-4c16-8879-ee1f50a03636' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = '5a639a9b-0095-40cf-a11c-b4347f2848ee' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '481700bc-30a0-46c9-80c4-f23ff765dcfb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = 'eb28f432-34e1-4d90-a61e-810e07c8d4a4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = '8848f3af-afb8-4c50-bf59-4c255e615dac' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = 'f6ad2070-d42c-4fd5-8ab4-bffcf13e1d1d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '35048028-cc49-4a44-9c3c-5aa6617eccad' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '0ec1f821-a2cf-4741-a827-ef007fe55881' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = '7da36043-3f01-48f6-9110-163dc7be6206' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '38e00bd7-51d6-4f7f-822f-f7b8e29e1d9c' WHERE id = 'bec304fe-8368-4937-a361-23e75c493aec' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '3b670db0-806f-4b98-8b8d-d598969508a9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '67cff889-7353-4e66-8f16-b6d32dd1f54a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = '5360d94e-52c8-456d-a529-9d7cd175eb27' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = 'faead3f8-adc9-4b94-b20c-b1c46196b786' AND venue_id IS NULL;
COMMIT;
```

## Chunk 3 of 5

```sql
-- CHUNK 3 of 5 — 65 statements
BEGIN;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'f8fb7be0-0149-4be7-907f-ee923f44e854' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '46380919-3675-41f0-b4af-5c697b7256c2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9f9ee273-984b-4afe-b915-abfef0823883' WHERE id = 'b0078043-2da7-416e-82dc-23f909094552' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = '2b207dc2-3ada-4294-a1ff-5d370673d5e8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = 'dd8f061a-96b8-49b3-a255-771f1a90b68e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = 'e1016095-e903-4988-8692-bc9751bfc3d8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '6f7cb148-177f-4613-af88-c20e267ab19f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'c682f9f1-08be-4165-9536-e94290f3b758' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '920d9f52-9d5d-4001-aa2d-be1c8551769a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '0590b71c-0e24-4987-a42e-5afb86bd7044' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e52e6dc-f32d-4125-8e29-1f496f2038fa' WHERE id = 'd8029b77-3dbc-4e09-84d7-f6a29154c1a0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5a84e301-91dd-451f-b5e7-4d583cfd4210' WHERE id = 'dc922be4-d449-4f4b-8539-258f7effd715' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = '06bd58ff-989c-4fca-b5f5-e2181400dd2d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '16afe4c4-141f-4df3-99bd-32c4d0cf65bb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7303584b-7125-42b5-a931-c04634497f82' WHERE id = '9d2c6523-3e88-43a2-ba96-0f48c0d30500' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = 'a5cb8d06-46a6-4ef5-bb99-e41344d54bac' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = '73c25d25-b3b0-4366-8a34-b50a5c94c078' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = 'c4491cb8-d156-4250-8d63-9bb1134f82b9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = '93d929b3-b8a9-4837-83d8-d782eec1c2bb' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'c3fec1cf-54e4-49a2-a098-085bce4959b9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '5c3f68e5-d5cc-4039-8249-80a4781e7bc4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = '2037f74f-a6e9-421b-bfda-d93d997655ff' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2348775-55ff-4353-ab43-cacea3c62b85' WHERE id = 'b9bb454c-a04e-4a4d-aa4e-56f85a834c1a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '46d800e7-5039-496e-84a9-af89394d4aae' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = '930efd83-b017-4322-adf6-3c133ed86ef3' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '8ecc4264-5485-4086-8878-fece6fc906c9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '02ec04fa-9ca6-4552-91f9-4b213b36a0e3' WHERE id = '7f600851-32b7-4ed8-84f8-15aec888252a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = 'fb725627-cad5-4247-8c3b-e441740062a8' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = '4e904f58-8cee-4304-b0d8-b0f67f26ad6b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = 'e6a12cfd-1d4b-4eca-ab25-3668b1a731d9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'df4f5298-5f0c-4676-ac7c-4db878916667' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '4ef3abae-0b1a-48eb-b911-cb18c6d251b3' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = '7fcd7238-46b1-48f6-a109-81d1eef46f43' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '38e00bd7-51d6-4f7f-822f-f7b8e29e1d9c' WHERE id = 'd31b5a4a-9bcc-4760-b849-680f68796f75' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = '5a6ff0b4-e6d8-4e3a-9d86-0b0e09a1c0f0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '1e8b9b42-fd8f-433d-b113-b089dc0ff4f1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '7b985dfe-96f3-4189-85da-ef32796ac63a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = 'f6b64673-734e-44cc-9b2e-2d482dcff07b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '4a1ce0e0-f37f-4fc2-ba58-3b55411d2ed7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '67e4ba5c-5e6e-4142-9ed3-a7632cf6cd42' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '71ab01f8-74b2-409c-b932-0bbaae243d12' WHERE id = '7fbbf065-109f-4d31-ba0e-1db395cb07d7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '7215e045-78f8-4a6a-a0ae-55f6b92e9def' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = '61b464da-bfc4-4645-a861-ad2542a85a5f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '624432f1-dceb-4da5-8d8d-04de657a6dac' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'ca79ff99-af9a-43b4-a5f5-99635d539c35' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'bed46f70-7506-4f56-a5c1-345c8b6e0f04' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '0141ae67-6165-46c6-9487-d97936f92676' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '3e9f1afb-1e26-461c-98e0-e71ed46e857d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '645b7f3c-ec0d-442e-835a-d5973fcf168c' WHERE id = '613482bd-e064-462a-8cca-960e9df7d473' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = 'e110f2f9-e0f4-4880-9584-f6dbc8152808' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '9ef6f115-f4c0-4a0b-bde7-7456b67fdc44' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = 'a244db20-00da-472d-ae02-fa2f05411f61' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = '5217e40f-2d66-44ce-9550-c109e3911f42' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = 'ba01d80f-85b0-48b1-8945-014e59483193' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'c5ff1d86-fa79-4fcd-a71e-13b4c3c74999' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'c9e9a65f-5f5d-4e3a-8104-7508352d7318' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = '7cb4471c-ef27-4407-9ec6-80d59eca6b9e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '0c2c9266-533f-46b4-9414-d751946113d1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = '1af2d4e6-7a09-4fce-a408-154f57cc0d65' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '54fa6387-a20e-4169-a4d6-89e5c802a436' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '6bb74a82-f4fd-43ef-8ff8-98146a77979d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = '23468756-3615-4993-872f-9f4eab164878' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = 'f2ece8b4-f9ec-47ba-8e02-3e209165421f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'cd2587ee-b87f-405e-b57f-5c689e4f1443' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '38aa3029-3bf5-41a3-a1c9-6137a6b12703' AND venue_id IS NULL;
COMMIT;
```

## Chunk 4 of 5

```sql
-- CHUNK 4 of 5 — 65 statements
BEGIN;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = '8c170196-5ae8-4648-9211-a688242be9a5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = '8cc4a824-18f4-41e1-92d9-64cea7bb4159' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '71ab01f8-74b2-409c-b932-0bbaae243d12' WHERE id = 'ee463d7e-9114-4938-84fa-56fe578d20e0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '387babda-5244-46e6-98da-13a67169e743' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '9fdd1c37-8ffd-4aab-8099-906bdfafe8e5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = 'b0a99c1c-3f6e-420a-af19-17d26730209a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = 'e364e222-4835-4956-b3c4-11d28d06e24c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '20771869-376d-4dd2-9e7c-0c0ca0efec9f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '8f268ac1-4365-4d67-a533-e2c5fae7cc5c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c1c940-8d2c-40ca-8b17-6d6992390e59' WHERE id = '1b2d88c6-485c-4543-898f-0648a9108291' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = 'e954b2f7-13cc-4e12-9f82-9b52ece62d68' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ea19437c-e035-47e4-9931-c87d0acb14af' WHERE id = 'd177cd02-2db1-4e4d-8d79-36fe35cfa07f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = '9818aea8-8d9a-458d-bae9-552d1ae2e42a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = 'c976904a-c055-4130-9cde-94a8c01c8106' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '428dad7b-d523-4656-979c-ba3024173224' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'b376c8e6-71c6-4ea2-be9d-5a5835f07580' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'a236af74-80d3-4bff-ac60-efb72078ec88' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = 'fb93a947-b395-412c-9706-8a414b78a17b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9d13aa44-8e45-4177-b52f-d155c964f678' WHERE id = '9dda474e-fa6d-4978-b88a-524a8e0256ad' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = 'a4c56dd5-cc3c-4fca-a7ac-3f36e9f9d3cc' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'cb23e672-fd43-4b57-8925-83bfc893b843' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = 'ae3c23f1-1cb5-42b1-bfd8-c80147efbd5e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = '89dcd00c-ae5d-49a3-a95d-f879bbc2211f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = '4f219022-a0e9-495c-b997-0b80ef717316' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'baf0d201-57b2-4511-89f3-7cf48fd9cd67' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '92532954-70e3-4e04-a798-94fc38560b54' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = 'cbb07edd-2ff1-442e-9c2b-ba3945a64627' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '054da52d-5fed-48b4-8925-6068844d7935' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = 'e27938c5-bc65-400e-aaa4-d5a239337830' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '48d420bb-7e9f-49de-867a-f94b55ceeb0a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = 'c19aa0a7-23c7-4701-96b0-5c91050f279d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = 'd4fac16c-5c1d-45cd-ad8b-fe89148686e2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = 'b3bbccee-089c-45dd-8c16-887e31950f59' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = 'd4c38fd1-13ee-4323-9e56-154d59fbb870' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '9d264caa-cbbf-44a5-ae19-85e614cfb18b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '4422b673-27a2-4bf2-b247-499820957275' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = 'df1f8a55-20cf-4b1c-9445-c1bb05b648d5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '98c41397-e04c-4e09-9eb0-c71818228f59' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '63165d1c-db41-4f9d-9998-1f2580c26787' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = 'b43d0f85-f7b0-4411-bbc6-0f79c128604a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '3e760ce2-5b5b-48a4-ae2f-ce15b051cc72' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'f9693556-a009-4a28-b9e4-575c2a27ee12' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = '822340ff-b5f2-45bf-b418-3406ddeaac5e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = '63a74a60-dd22-4be2-a5d5-da1225027899' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '47290aa9-e0e7-411b-84a2-e4e03955ed4b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '1e963b22-e3ef-4953-a38d-56632844a87e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = '610a0053-1c1d-47a3-a29f-d71fc454c62c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'f32fa619-86ae-4e13-b143-d7c54940e656' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '665ac74a-cdbc-4583-a7f0-a6163ecda25c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = 'b6688839-7621-45d6-ba69-d6a26909f73b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = '3cd81e3d-e138-4909-bec1-2ff0c790ed77' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = 'c9fad8b3-1f63-413a-8c08-430c7bba0d4e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '3d955264-9d4d-4154-a617-f8b9004f083f' WHERE id = 'bf43d1de-03ff-498b-8895-670cd14af4f1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c7f7d3-c621-4609-a300-2d3dca46aa66' WHERE id = '1eb283df-9180-4625-9d43-868a50a1dd58' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'd7360955-e81b-4207-af2b-0cd82201730d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'ad84d544-e70a-44d8-8b17-191064550b24' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = 'f78b57f7-914e-48ac-ae0d-439945d84a1e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f49f4399-836c-40cf-83f6-86d040242815' WHERE id = '45a39aee-0f12-4160-b36f-4f3ca339add1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'c1f44681-c488-4006-bce8-d8ebb8d6b7be' WHERE id = '75b5cb3b-e59d-468a-bab0-8a8b565a156d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = 'f64ef97a-a5d9-441e-af9a-362a85213d6f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = '25f52a07-e805-437f-afbf-6c7c3afeb0d7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '12a7584f-28f8-4269-a178-ced689f81688' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '6a1f70bc-968a-4486-8274-a5daa1371072' WHERE id = '8279a320-38fb-46ba-b2d9-687112c732c7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '4ebad5a8-e3b1-4a2d-af5b-a0b4248ba25b' WHERE id = '7d99ef76-49e1-4eb8-a635-23668d5a585c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '861d1170-d497-4756-baca-5b7b618d3020' AND venue_id IS NULL;
COMMIT;
```

## Chunk 5 of 5

```sql
-- CHUNK 5 of 5 — 52 statements
BEGIN;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '7def61b3-f0e8-4c2f-b41b-5fa42fcd07a6' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = '2d1c0663-b018-44f2-aaa7-dfc83d4b64b0' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = '3f8419d2-e776-48bf-86b2-ddbb75dded1c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '42ec4917-cac5-4660-9ef1-47fdb76a4de3' WHERE id = '7b81d3f4-f2c1-40ca-abe4-534ca70c8f3b' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = 'e9df0bca-4f7b-4e67-a8e4-2cc4f0c8be4e' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = '84a9e949-3028-4e02-ab16-4434819d3ab5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '38ef1a25-c146-435a-9477-d6320c525fa2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '0f9b96a9-6b2d-45b9-9a0e-f3b17ec78ddd' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a2a2a63f-9a13-4441-84ce-041e28743071' WHERE id = '44e391f9-f762-46a5-9346-4d48d76875e2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '1222bd82-9523-4ce6-aaf6-0344a0b2d296' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '7f5d7c21-a9b5-4bdc-9a8c-77d3503db0a1' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = 'c4d8f3fe-f99b-4b6d-ab9a-686d1dbf5b27' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '82598cab-62c1-413b-a170-e6618d1f4bda' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '805614a4-03b6-4c7c-9b1a-19802df62b7a' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = 'afa601a8-7c46-499c-ac60-ecede4a979dd' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '825ea1cf-ac7d-4450-a740-c2b37276a5ac' WHERE id = 'd2ffd3b5-151e-4595-a28c-66ba788a772d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = '9a4a9942-f6b7-4d9a-a80c-2a7ddcf8cec4' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'c625aaf8-5a93-4bd5-9c0c-0d8e598f2156' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = '4fc59025-6a73-426b-943c-e160ec6ed894' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = 'e1a48a68-f0ee-4fe7-bc7a-7e59d6dab096' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '79f7356c-f98b-46c1-b230-29459f7217f7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = '975ef0c6-c872-412a-913c-59d5d5b198ff' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '41a8db0d-2387-41bb-a6fa-1347a63b5eae' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = 'f47204a7-69c1-4bc4-a6f5-ef6c87937c94' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9e8dd61d-27ec-4446-8348-91f4da704118' WHERE id = '60c05cc1-5de1-485a-bc44-5ac3091ad65c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ef318e80-36ff-4675-b799-6cf2f9430f7f' WHERE id = 'b5273e32-2455-4ad1-9606-9d1a6d2fe020' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '23f66e26-a428-4c80-9a57-0fbf8cd763df' WHERE id = '6ffece53-5343-4872-9e2e-5410e6982e20' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'eb0837a9-b7a6-4094-89e5-4048a54a7495' WHERE id = 'c06ef443-3007-4f2c-b32f-a0d49808e561' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = '09348707-cff0-409e-bead-6ba66ec80f73' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = '4aa9be6d-e226-452b-8dbb-d109a574976d' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'd94c44a9-3ab9-4db8-be5e-1d3b31cfc8d7' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '7a4f8e4e-aced-40b7-bd5a-4b95dc24a416' WHERE id = '71c41e75-45b9-439e-bc68-758597ab1526' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'faaee0f4-4907-48da-bed2-0d3541b9d540' WHERE id = 'fbf688fe-eb9a-4906-802e-6b9c93e0a8fc' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b409ec3b-1a68-4c8d-b504-12ca8e85580b' WHERE id = '8c0e70d0-42e6-454c-9cc1-514d724dd86c' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b34519e2-e82f-420c-8912-813ae234bd5b' WHERE id = '3abcb5c8-d237-4ada-98ed-969d248c58b9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2cf14ec5-52fa-48a8-baa2-0070e4db134f' WHERE id = 'ac669cdf-24f3-4abe-bc25-a8166eb9b85f' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'b3e507c1-ef21-4b45-ba92-2715cbcd70a3' WHERE id = '22d9d144-d9ef-48c9-a6f1-069d9e5477a5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = '7818c10c-21a6-41a9-8126-fcc89428cea9' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '5e9fe0c9-63fc-4ac9-8df1-cd1874da3cd3' WHERE id = 'ccfdb28c-7920-4bb8-bcf5-90d1f0666715' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '87cee07c-e922-49be-aa19-d9d64dc062f6' WHERE id = '8072c7ce-e43a-4aa3-86d9-92d78f67ac35' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'fb9fac59-1e17-48c7-ba50-c183e6892885' WHERE id = '022f34f9-df1a-4759-8a14-0a7757420462' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '2b4b3f54-f698-4f07-a668-a4078220389c' WHERE id = 'b519135b-992a-45c9-bf5f-63d7adeef917' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894' WHERE id = 'd60832ad-bfe8-4f04-8e96-ecb11991e4d5' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '9471d745-deb3-428f-82f0-ba5cddf296b5' WHERE id = '2e4849dd-bf99-4b8f-ae82-60a3b0703aaf' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '068015f5-519e-4154-8d60-9454f0701432' WHERE id = '942f406c-f7f4-4cf7-abb8-841d9a1d9870' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = '08718f47-b8fd-4ad6-916a-1d23356d9880' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = 'ad88528c-9532-45fe-89cb-64b6a3ba75df' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '71ab01f8-74b2-409c-b932-0bbaae243d12' WHERE id = '4ef278a0-25b4-4881-9fcd-d1fd667b12ad' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'f4c1c940-8d2c-40ca-8b17-6d6992390e59' WHERE id = '2bad1a89-d134-4512-babd-ccc3b57e3f91' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = '1a87cc8c-271f-46b8-bac6-2b89202391bb' WHERE id = 'c5442166-88e1-4bce-9d47-676b5b85d1f2' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'ea19437c-e035-47e4-9931-c87d0acb14af' WHERE id = '16cc093f-c91c-4c6c-b93e-c9e515ceff72' AND venue_id IS NULL;
UPDATE discovery_events SET venue_id = 'de22d722-57ae-4c29-9344-5bd13df67d1d' WHERE id = 'ecf95d40-de52-4cc2-ac23-0936af28dc58' AND venue_id IS NULL;
COMMIT;
```

### After each chunk

```sql
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id
FROM discovery_events e
WHERE e.event_date >= CURRENT_DATE;
```

Expected `with_venue_id` after each chunk: **134 → 199 → 264 → 329 → 381**.

---

# TASK 4 — AFTER YOU RUN IT

**1. Confirm the count.**

```sql
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;
```
🎯 **Expect 669 / 381 / 381.** (Was 669 / 69 / 69.)

**2. Confirm the trucks.**

```sql
SELECT count(DISTINCT e.truck_name) AS pinnable_trucks
FROM discovery_events e
JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE AND v.latitude IS NOT NULL;
```
⚠️ I have **not** predicted a number here. 🧪 It is 7 today; it will rise substantially, but I did not measure the post-apply distinct-truck count and will not state one I have not computed.

**3. Confirm nothing else moved.**

```sql
SELECT count(*) AS rows_differing_from_snapshot
FROM discovery_events e
JOIN venue_link_backup_20260907 b ON b.id = e.id
WHERE e.venue_id IS DISTINCT FROM b.venue_id;
```
🎯 **Expect exactly 312.** More than 312 means something else wrote to the table.

**4. On the public map.** Village Foodie should show markedly more pins. ⚠️ The feed route sets `revalidate = 300`, so allow **five minutes**, and the client sends `cache: 'no-store'` with a cache-busting timestamp, so a hard refresh is enough after that.

## 🔴 What will still be missing — do not read this as failure

| Still missing | Why |
|---|---|
| **288 of 669 future events** (669 − 381) | 243 low-confidence (you are reviewing), 32 with no coordinate-bearing venue at all, 13 held back here |
| **The 42-event Perky Beans block** at *The Bull Pub* | low confidence — 36 km wrong; it is in your review set |
| **The 185 events** with landmark-phrase villages | low confidence, distance unmeasurable |
| **Any event for an excluded truck** | truck-level gate, independent of linking |
| **Pizzeria Gusto's scraped events** | shadow is `excluded` — by design; its real schedule comes from `truck_events` |
| **New events from tomorrow's scrape** | 🔴 Pass A still writes `venue_id: null`, so this pass must be **re-run after every scrape** until that changes |
| **Correct pins for the 7 suspect venues** | needs the venue-coordinate correction step |

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No file in the working tree was edited in this task** — tree is **26 modified / 82 untracked**, unchanged from the end of the previous task apart from this report overwriting an existing filename.

🧪 Two analysis artifacts were written into `scripts/backfill-output/` (`APPLY-vetted.json`, `APPLY-final-pairs.json`). That directory is **gitignored** (`.gitignore:51`), so `git status` is unaffected. The July and pre-fix artifact sets remain preserved in the session scratchpad.

🔴 **I created, updated and deleted nothing in the database. No venue row was touched by me, and none will be touched by the SQL above.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Whether the 312 links are *correct*, only that they are internally consistent and pass every check I can compute.** High confidence means the venue name matched and the village agreed within 15 km — it is not ground truth. The strongest residual risk is the 29 high links whose event village has no anchor and could not be distance-checked at all.
- 🔴 **Whether the 7 suspect venues' coordinates are wrong or their postcodes are** — a venue 8.2 km from its postcode could be either. I held the links back rather than deciding, because both readings mean the pin cannot be trusted.
- ⚠️ **The post-apply distinct-truck count** — not computed, so not stated.
- ⚠️ **Whether anything else writes `discovery_events.venue_id` between now and when you run this.** `/api/inbound-schedule` can, on the hourly cron. The `AND venue_id IS NULL` guard makes that safe (a statement would simply affect 0 rows), but it would make the final count exceed 381 legitimately — check query 3 against the snapshot if the numbers surprise you.
- ⚠️ **I could not verify the block by running it**, which is the whole point of this task; the row counts above are predictions from measured state, not observations.
- 🔴 **The 243 low-confidence links are untouched and unexamined here**, as instructed — including the 21 landmark-village links whose risk remains unknown rather than zero.
