# `venues` duplication — counted

**8 September 2026 · READ-ONLY investigation · no row inserted, updated or deleted · no migration written · nothing staged, committed or pushed**

**Marking.** 🔎 source-read · 🧪 executed. **Every database call was a `select`.** No `git add` in any form. The only file written is this report.

**Garbled spans: none. No instruction contradicted another.**

🔴 **Extensions searched: every one present in the tree**, with no `--include` filter on any search — `avif cjs css csv gitignore html ico iml jpeg jpg js json local log md mjs pem png sql svg toml ts tsbuildinfo tsx txt webp xml yml`. **The venue creator is `scripts/run-scraper.js`, a `.js` file**, and it was found by an unscoped search.

---

## 🔴 TWO CORRECTIONS TO THE PROMPT'S PREMISES, BOTH LOAD-BEARING

**1. `The Fox` exists TWICE with that exact name, not three times — and that makes the test harder, not easier.**
🧪 Live: `The Fox` [Lyng] and `The Fox` [Burwell]. The third is **`The Fox Inn`** [Honington] — a different string. 🔴 **But `lib/venue-matcher.ts` treats `inn` as a stopword**, so its `toks()` reduces all three to `["fox"]` and a token-based rule collapses all three. The prompt's test case is correct in spirit and sharper than stated.

**2. Pizza Mondo's own-page rows are NOT uniquely unlinked — the pattern you inferred does not hold.**
🧪 Own-page (`order.pizza-mondo.co.uk`): **113 of 123 unlinked (92%)**. Aggregator-sourced: **16 of 18 unlinked (89%)**. **Both are unlinked at almost the same rate.** Of its 10 future rows, **2 are linked, 8 are not.** The true statement is broader and worse — see Q8.

---

# 1. THE FULL COUNT, AND THE RULE

## The rule, stated before it was run

🎯 **I did not invent a rule — I reused the ones that already exist** (`lib/venue-matcher.ts`'s village/token logic and the 15 km ceiling added when its single-candidate branch was fixed), and tightened the distance because **a merge is destructive where a link is reversible.**

A **pair** is a candidate iff **both** hold:

1. **NAME** — identical normalised name, **or** one normalised name contains the other, **or** identical significant-token set (`toks()`, which drops `the/pub/inn/tavern/arms/bar/hotel/and/at/on/of`).
2. 🔴 **DISTANCE** — **both rows carry coordinates** and they are **≤ 5 km** apart.

**Distance is required, never inferred.** A pair where either row lacks a coordinate is **not** a candidate.

⚠️ **What this rule does with its degenerate input**, stated before any result is quoted — this is the V1.1 village-anchor trap, where a village holding one venue anchored to itself and always passed:
- **One row with no coordinate** → the pair is **excluded**, not passed. 🧪 Exactly **1 of 574** venues has no coordinate, so this excludes one row from consideration and cannot mask anything.
- **A set of one** → not a set; never reported.
- 🔴 **Crucially, this rule never compares a venue against a group it belongs to.** It compares two concrete rows and requires a real, measured distance between them. There is no self-anchoring path.

## 🔴 THE FOX TEST — run first, as required

🧪 Three name-similar Fox pairs, all **REFUSED on distance**:

| Distance | Pair | Name test | Verdict |
|---|---|---|---|
| **69.75 km** | `The Fox` [Lyng] ↔ `The Fox` [Burwell] | **identical** | ✅ **REFUSED** |
| **46.07 km** | `The Fox Inn` [Honington] ↔ `The Fox` [Lyng] | containment | ✅ **REFUSED** |
| **33.07 km** | `The Fox Inn` [Honington] ↔ `The Fox` [Burwell] | containment | ✅ **REFUSED** |

🎯 **The rule survives its disqualifying test.** The closest two Foxes are **33 km apart**, so any threshold below that separates them; 5 km leaves a 6.6× margin.

## The count

| | |
|---|---|
| Total `venues` rows | **574** (573 with coordinates, 1 without) |
| Name-similar pairs **before** the distance test | **174** |
| 🔴 **Rejected on distance (> 5 km)** | **122** |
| Pairs surviving both tests | **52** |
| **Candidate duplicate sets** | **38** |
| **Rows involved** | **88** (15.3% of the table) |

🔴 **The 122 rejections are the point of the rule.** The furthest eight that a name-only rule would have merged:

| Distance | Pair |
|---|---|
| **444.5 km** | `The Common` [Saffron Walden] ↔ `Groovy Party On The Common` [null] |
| **305.3 km** | `Nina's Farm Cafe` [Nina's Farm] ↔ `Nina's Farm` [Widdington] |
| **121.1 km** | `The Cross Keys` [Hatfield Peverel] ↔ `Cross Keys` [Wallingford] |
| **111.4 km** | `Near the Co op Store` [Laxfield] ↔ `Co-op` [Alconbury Weald] |
| **103.2 km** | `Kings Head Public House` [null] ↔ `Kings Head` [Fen Ditton] |
| **102.2 km** | `The Bell` [Kesgrave] ↔ `The Bell` [Great Paxton] — **identical names, 102 km apart** |

⚠️ **`Near the Co op Store` [Laxfield] is a real pitch**, named for the shop the truck parks beside, and the rule correctly refuses to merge it into a Co-op 111 km away. **An unusual name is not bad data.**

---

# 2. TIERS

| Tier | Sets | Definition |
|---|---|---|
| **CERTAIN** | **15** | name-similar **and** ≤ 500 m apart |
| **PROBABLE** | **19** | name-similar **and** 0.5–5 km apart |
| 🔴 **REFUSED (category name)** | **4** | the name is a category, not a place |

## 🔴 The four REFUSED sets — proposed for nothing

🧪 Category names measured live, not assumed:

| Phrase | Rows containing it | Max spread |
|---|---|---|
| **`Village Hall`** | **43** | **113.6 km** |
| **`The Common`** | 4 | **444.5 km** |
| `Off The Beaten Truck` | 7 | **50.1 km** |
| `foodPark` | 8 | **16.9 km** |
| `The Fox` | 3 | 69.8 km |
| `The Street` | 2 | 2.6 km |

✅ **V1.1's "43 venues containing Village Hall" is exactly right.** Its "`foodPark` five ways, `Off The Beaten Truck` six" is now **8 and 7** — the manual is correct and stale, not wrong.

**The four refused sets:**

| Set | Rows | Spread | Why refused |
|---|---|---|---|
| **foodPark** | `FoodPark Biomedical` · `FoodPark CB1` · `foodPark at The Green & The Gardens …CB2 0AA` · `foodPark` | **2.33 km** | 🔴 A category. `FoodPark CB1` (52.1947, 0.1360) and `FoodPark Biomedical` (52.1740, 0.1342) are **different real sites 2.3 km apart**; `Genome Campus` is ~10 km further and did not even enter the set |
| **The Common, Saffron Walden** | `Saffron Walden (The Common)` · `Saffron walden common` · `The Common` · `Off The Beaten Truck - The Common` | 730 m | 🔴 `The Common` is a category name; these four are *probably* one pitch, but merging on a category name is the rule that produced the Troston collapse |
| **Off The Beaten Truck, Northstowe** | `Off The Beaten Truck` · `Off The Beaten Truck - Northstowe` | 540 m | 🔴 `Off The Beaten Truck` is an operator brand across ≥7 sites, 50 km apart |
| **The Street** | `The Street - By Post Office` [Elmsett] · `The Street` [Whatfield] | 2.58 km | 🔴 Category name, **different villages**; V1.1 records the normaliser stripping `street` entirely |

---

# 3, 4. BLAST RADIUS AND KEEPER — CERTAIN TIER

Keeper rule: 🔴 **coordinate quality first** (not placeholder/sentinel, has a postcode), **then** event count. ⚠️ V1.1: `ignoreDuplicates: true` is retained, so **a wrong coordinate is permanent and unrecoverable by re-run** — which is why coordinate quality outranks volume.

| # | Set | Spread | Keeper (★) | Loser(s) | `discovery_events` | `truck_events` |
|---|---|---|---|---|---|---|
| 1 | Trumpington Meadows | 499 m | ★ `83a594ee` "Trumpington Meadows" pc CB2 9WE | `e0e5a4f5`, `2009d680` | 21 + 0 + 7 | 0 |
| 2 | Rose & Crown | 313 m | ★ `9e8dd61d` [Histon] pc CB24 9JB | `309fb050` [Impington] | 24 + 0 | 0 |
| 3 | Railway Inn Framlingham | 199 m | ★ `4de902ec` "The Railway Inn Pub" | `7e060cb0` | 11 + 9 | 0 |
| 4 | Huntingdon Market Square | 109 m | ★ `6be0341c` "Huntingdon Market Square" | `c378327e` "Market Square" [Huntington — misspelt] | 15 + 4 | 0 |
| 5 | Railway Arms, Saffron Walden | 65 m | ★ `e9995689` pc CB11 3HQ | `b57e0a3e` | 6 + 4 | 0 |
| 6 | Debenham | 229 m | ★ `b0898490` "Debenham Vets" | `05b842a5` | 3 + 2 | 0 |
| 7 | Tharp Arms | 97 m | ★ `02165392` pc CB7 5PR | `4c2558c6` [village NULL] | 5 + 0 | 0 |
| 8 | Cambridge Science Park | 210 m | ★ `71ab01f8` pc CB4 0FZ | `fb0a9e45` "Unit 332…" | 4 + 0 | 0 |
| 9 | Mariners Compass | 112 m | ★ `2044618c` pc NR31 6TD | `006d5e10` [NULL] | 3 + 0 | 0 |
| 10 | Essex Foodies Market | **0 m** | ★ `b80de529` | `875feff8` | 2 + 1 | 0 |
| 11 | Dyke's End | 350 m | ★ `b726f97c` pc CB25 0JD | `b6a47a04` | 2 + 0 | 0 |
| 12 | Harleston | 70 m | ★ `e2d775d4` | `600314ac` | 1 + 0 | 0 |
| 13 | Hoveton Village Hall | 203 m | ★ `d97bee73` [Hoveton] | `7bd552f8` [Wroxham] | 1 + 0 | 0 |
| 14 | Darwin Green | 277 m | ★ `465add85` pc CB3 0GX | `4c462da4` | 0 | 0 |
| 15 | Christchurch Park | 144 m | ★ `de69964c` pc IP4 2BE | `1f4f7ca8` | 0 | 0 |

🎯 **Total CERTAIN blast radius: 125 `discovery_events`, 0 `truck_events`.** **No operator event is touched by any CERTAIN merge** — a materially safer picture than feared.

## PROBABLE tier — larger and more consequential

| # | Set | Spread | Keeper | Refs | Note |
|---|---|---|---|---|---|
| 16 | **Wintringham ×6** | **5.10 km** | ★ `a485dd51` "Wintringham Plaza" pc PE19 0AW (71 events) | **77** | 🔴 **Six rows.** Contains `efd231fa` — **a BIG-MOVE held row** |
| 17 | The Bell, Great Paxton | 1.27 km | ★ `000dd13a` "The Bell Pub" pc PE19 6RF | 46 | ⚠️ keeper has 10 events, loser 36 — **coordinate quality chosen over volume** |
| 18 | Platform One / Clare Castle ×3 | 546 m | ★ `f49f4399` | 36 | 🔴 **the only set touching `truck_events` (5)** |
| 19 | The Bull, Saffron Walden | 1.06 km | ★ `a0f16e12` "The Bull Pub" | 36 | loser is tierA-applied |
| 20 | The Lodge, Red Lodge | 737 m | ★ `eb0837a9` pc IP28 8TT | 26 | |
| 21 | Barracks / Woodbridge Barracks | 869 m | ★ `6449ecb6` [Sutton Heath] | 18 | ⚠️ a landmark-named pitch — real |
| 22 | Lingwood Village Hall | 2.55 km | ★ `5a84e301` | 13 | ⚠️ contains "Village Hall" but both rows are in **Lingwood** |
| 23 | Saffron Grange | 2.38 km | ★ `f91f4023` | 11 | |
| 24 | Affleck Arms | 2.95 km | ★ `645b7f3c` pc CB8 8TG | 7 | |
| 25 | King's Head, Fen Ditton | 808 m | ★ `69a1e623` | 7 | |
| 26 | Five Bells / Rattlesden ×3 | 530 m | ★ `8766dd25` | 5 | |
| 27 | Steeple Stores ×3 | 611 m | ★ `d535a817` | 4 | loser tierA-applied |
| 28 | Clay Farm Community Garden | 664 m | ★ `62981ff2` | 2 | |
| 29 | Punch Bowl, Battisford | 1.63 km | ★ `b2c8c2d3` | 1 | |
| 30 | Sweffling Village Hall | 1.83 km | ★ `293d492e` | 0 | loser tierA-applied |
| 31 | Kenton | 588 m | ★ `85e554e7` | 0 | |
| 32 | Northstowe Tap & Social | 3.95 km | ★ `9d332e3e` | 0 | ⚠️ widest PROBABLE spread |
| 33 | Eddington Beer Garden | 1.07 km | ★ `b38a1fe6` pc CB3 1SE | 0 | |
| 34 | *(one further set, 0 refs)* | — | — | 0 | |

---

# 5. INTERACTION WITH WORK ALREADY HELD

🧪 Read from the actual files, not memory: `docs/sql/venue-coords-20260907/` — **54 tierA ids (applied)**, **22 tierB ids (held for review)**, **5 BIG ids (opt-in)**.

| Conflict | Sets |
|---|---|
| 🔴 **Touches a BIG-MOVE held row** | **1** — set 16 (Wintringham) contains `efd231fa` "We Are Wintringham", one of the five ≥20 km moves |
| ⚠️ Touches a tierA row **already applied** | 6 — sets 1 (×2), 5, 19, 27, 30 |
| Touches a tierB held row | **0** |

🔴 **The one real ordering conflict is set 16.** `efd231fa` is proposed here as a **loser** and is simultaneously the subject of a held 29.9 km coordinate correction. **If the correction runs first, you correct a row you then delete — wasted but harmless. If the merge runs first, the held correction targets a row that no longer exists and silently updates nothing.** Neither corrupts data; both waste the decision. **Decide set 16 and `efd231fa` together, or not at all.**

⚠️ The six tierA overlaps are benign — those coordinates are already applied, so a merge simply discards a corrected row in favour of a keeper. **But it does mean six of the 54 applied corrections would be thrown away**, which is worth knowing before approving.

---

# 6. THE UNIQUE CONSTRAINT

🔎 `venues_name_village_key` on `(name, village)` — V1.1 records it added by hand ~11 June, instantly breaking every upsert that used `onConflict: 'name'` with 42P10. That history is not disputed here.

🧪 **Measured now:**

| | |
|---|---|
| Rows sharing an **exact** `(name, village)` pair | 🎯 **0** |
| 🔴 Keeper/loser pairs inside my candidate sets sharing an exact `(name, village)` | 🎯 **0** |
| Rows with `village IS NULL` | **46** |

🎯 **A merge cannot violate the constraint.** Every proposed merge deletes a loser whose `(name, village)` differs from the keeper's — that is precisely *why* both rows exist. Deleting a row never creates a collision.

⚠️ **The 46 null-village rows are the constraint's blind spot**, and it is the mechanism V1.1 already records: **nulls are DISTINCT in a unique index**, so `(name, NULL)` never conflicts with `(name, NULL)`. Four of my candidate losers have a NULL village (`4c2558c6`, `006d5e10`, `875feff8`, `ee15dca6`). **The constraint was never going to stop those being created.**

---

# 7. WHY THEY KEEP APPEARING

🔎 Read from `scripts/run-scraper.js` — the `.js` file:

```js
// :966 — the queue key
const compositeKey = `${finalVenue}|${extractedVillage}`;
if (!newVenuesDetected.has(compositeKey)) { newVenuesDetected.set(compositeKey, {...}) }

// :1833 — the write
.upsert({ name: q.name, village, ... }, { onConflict: 'name,village', ignoreDuplicates: true })
```

🔴 **`scripts/run-scraper.js` does not import `findVenue` and never matches a candidate against the existing `venues` table before creating one.** 🧪 Grep for `findVenue|venue-matcher` in that file returns **one comment and no code**.

🎯 **So the mechanism is exact: the queue is keyed on the raw extracted string, and the upsert dedupes only on a byte-identical `(name, village)`.** A model that writes `foodPark` today, `FoodPark CB1` tomorrow and `Food Park-Cambridge Science Park` next week produces **three rows**, and the constraint is satisfied every time. **Nothing in the path asks "do we already have this place?"**

**What would have to change (not implemented, not proposed as code):** before inserting, run the candidate `(name, village)` through the existing `findVenue` against current `venues`, and **reuse a confident match instead of inserting**. The matcher already exists, is already used by `/api/inbound-schedule` and the backfill, and already has the village rule and the 15 km ceiling. **The gap is that the creator does not call it.**

## 🔴 And merging alone will not hold, because of the unlinked backlog

🔎 **Pass A writes `discovery_events` with no `venue_id` at all**; linking is a separate hand-run job. So:

🎯 **An unlinked event carries only a venue *name*. Merging venue rows does not touch it.** When that event is eventually linked, it is matched by name — and if the name it carries is a spelling that no longer exists as a row, it will match something else, or nothing. **Merging without fixing the creator and the linker will be undone by the next scrape**, and the 2,219 unlinked rows are a standing reservoir of old spellings waiting to re-create them.

---

# 8. THE UNLINKED BACKLOG, COUNTED

| | |
|---|---|
| `discovery_events` total | **4,283** |
| 🔴 **`venue_id IS NULL`** | **2,219 — 51.8%** |
| Linked | 2,064 |

**By source convention:**

| Unlinked / total | % | Convention |
|---|---|---|
| **1,817 / 2,942** | **62%** | `URL:` — own-page scrape |
| 181 / 581 | 31% | `Manual Entry` |
| 88 / 520 | 17% | `Screenshot` (Apps Script) |
| 28 / 109 | 26% | `hg_scraper` (Pass B) |
| **103 / 108** | **95%** | `hatchesup_scraper` (the June one-off) |
| 0 / 4 | 0% | `Manual entry` (hand-inserted, 7 Sep) |

**Relative to the 312-statement linking pass:**

| | |
|---|---|
| Unlinked rows created **before** 2026-09-07 | **2,191** |
| Unlinked rows created **on/after** 2026-09-07 | **28** |

⚠️ **I could not date the pass from `updated_at`.** 🧪 **Zero linked rows have `updated_at ≠ created_at`** — so either no trigger maintains `updated_at`, or the hand-run `UPDATE` did not move it. **`updated_at` is not a usable marker on this table**, and I am reporting that rather than presenting `created_at` as if it dated the pass.

## Your Pizza Mondo inference — **corrected**

🧪 Own-page **113/123 unlinked (92%)**; aggregator **16/18 unlinked (89%)**. **Not a source-specific pattern.** Of 10 future rows, **2 linked, 8 not**.

🎯 **The true statement is worse than the one inferred: nothing has linked anything since the pass, for any source.** Only **28** unlinked rows have been created since 7 September — not because linking is happening, but because **the scraper is largely broken and few rows are being created at all.** The backlog is not being worked down; it is simply not growing fast.

---

# WHAT THE EVIDENCE WOULD LOOK LIKE IF IT WERE PROVING NOTHING

| Claim | Hollow signature | How ruled out |
|---|---|---|
| The rule is safe | It passes because nothing tests it | 🎯 Run against The Fox **first**; 3/3 refused, closest pair 33 km — a 6.6× margin on the 5 km threshold |
| 38 candidate sets | A loose rule inflating the count | 122 of 174 name-similar pairs **rejected on distance**, including two identical `The Bell` rows 102 km apart |
| Distance is measured | A guard that passes its degenerate input | 🔴 The rule **requires two coordinates**; a missing one **excludes** the pair. Only 1 of 574 rows lacks coordinates. **No self-anchoring path exists** — unlike the village-anchor guard V1.1 records, which passed 7 broken venues |
| Category names | Four names asserted from the manual | Measured live: `Village Hall` **43 rows / 113.6 km spread**; `The Common` 4 / 444.5 km |
| Constraint safety | Assuming a delete cannot collide | Enumerated all 574 `(name, village)` pairs: **0 exact duplicates**, **0** inside candidate sets |
| Blast radius | Counting only `discovery_events` | Counted `truck_events` separately: **0 across all CERTAIN sets**, 5 in one PROBABLE set |
| Held-work conflicts | Quoting the manual's 22 and 5 | Read the ids out of the actual SQL files: 22, 5, 54 — all three match |

---

# PROPOSED MERGES

🔴 **Nothing applied. Deciding nothing. Coordinate quality is the keeper rule, because `ignoreDuplicates` makes a wrong keeper coordinate unrecoverable.**

## Tier CERTAIN — ≤ 500 m apart, 15 merges, 125 events, **0 operator events**

| # | Keep → drop | Blast | Reason |
|---|---|---|---|
| 1 | `83a594ee` → `e0e5a4f5`, `2009d680` | 28 de / 0 te | 499 m; keeper has the postcode and 21 events. ⚠️ both losers tierA-applied |
| 2 | `9e8dd61d` → `309fb050` | 24 / 0 | 313 m, same postcode CB24 9JB, village spelt two ways |
| 3 | `4de902ec` → `7e060cb0` | 20 / 0 | 199 m, same postcode IP13 9EA |
| 4 | `6be0341c` → `c378327e` | 19 / 0 | 109 m; loser's village is misspelt "Huntington" |
| 5 | `e9995689` → `b57e0a3e` | 10 / 0 | 65 m, same postcode. ⚠️ loser tierA-applied |
| 6 | `b0898490` → `05b842a5` | 5 / 0 | 229 m, same village |
| 7 | `02165392` → `4c2558c6` | 5 / 0 | 97 m; loser has NULL village and no postcode |
| 8 | `71ab01f8` → `fb0a9e45` | 4 / 0 | 210 m; keeper has postcode CB4 0FZ |
| 9 | `2044618c` → `006d5e10` | 3 / 0 | 112 m; loser NULL village |
| 10 | `b80de529` → `875feff8` | 3 / 0 | **0 m — identical coordinates** |
| 11 | `b726f97c` → `b6a47a04` | 2 / 0 | 350 m. ⚠️ keeper tierA-applied |
| 12 | `e2d775d4` → `600314ac` | 1 / 0 | 70 m, same village |
| 13 | `d97bee73` → `7bd552f8` | 1 / 0 | 203 m, same postcode NR12 8DU |
| 14 | `465add85` → `4c462da4` | 0 / 0 | 277 m; keeper has postcode |
| 15 | `de69964c` → `1f4f7ca8` | 0 / 0 | 144 m; keeper has postcode IP4 2BE |

## Tier PROBABLE — 0.5–5 km, 19 merges. **Review individually.**

| # | Keep → drop | Blast | Reason |
|---|---|---|---|
| 16 | `a485dd51` → `efd231fa`, `12eaee47`, `71fde9ee`, `a6d7e179`, `5b09c044` | **77 / 0** | 🔴 **Six rows, 5.10 km, and `efd231fa` is a held BIG move. Decide the merge and that correction together.** |
| 17 | `000dd13a` → `2f9b7347` | 46 / 0 | ⚠️ keeper has 10 events, loser 36 — **postcode beat volume** |
| 18 | `f49f4399` → `c482fe78`, `1f38ed3f` | 36 / **5** | 🔴 **the only set touching operator events** |
| 19 | `a0f16e12` → `129e6b24` | 36 / 0 | 1.06 km, same postcode CB11 4SB |
| 20 | `eb0837a9` → `ee15dca6` | 26 / 0 | 737 m; loser NULL village, no postcode |
| 21 | `6449ecb6` → `dc4f99ad` | 18 / 0 | 869 m — a real landmark-named pitch |
| 22 | `5a84e301` → `9e52e6dc` | 13 / 0 | 2.55 km, both in Lingwood, same postcode |
| 23 | `f91f4023` → `918d38e1` | 11 / 0 | 2.38 km |
| 24 | `645b7f3c` → `1b0f612e` | 7 / 0 | 2.95 km, same postcode CB8 8TG |
| 25 | `69a1e623` → `7cd2b619` | 7 / 0 | 808 m, same postcode |
| 26 | `8766dd25` → `6b60aba3`, `eb21445b` | 5 / 0 | 530 m |
| 27 | `d535a817` → `21ffcb4c`, `09b7651d` | 4 / 0 | 611 m. ⚠️ one loser tierA-applied |
| 28 | `62981ff2` → `3be73cc7` | 2 / 0 | 664 m |
| 29 | `b2c8c2d3` → `eb91e690` | 1 / 0 | 1.63 km, same postcode |
| 30 | `293d492e` → `738056a8` | 0 / 0 | 1.83 km. ⚠️ loser tierA-applied |
| 31 | `85e554e7` → `df75dce8` | 0 / 0 | 588 m |
| 32 | `9d332e3e` → `5b4eb803` | 0 / 0 | ⚠️ **3.95 km — widest; least certain** |
| 33 | `b38a1fe6` → `8b136eb7` | 0 / 0 | 1.07 km |
| 34 | *(one further 0-ref set)* | 0 / 0 | |

# REFUSED — proposed for nothing

| # | Set | Rows | Why |
|---|---|---|---|
| R1 | **foodPark** — `f4c1c940`, `de22d722`, `ea19437c`, `1a87cc8c` | 4 | 🔴 Category name. CB1 and Biomedical are **2.3 km apart and genuinely different sites**; Genome Campus ~10 km further |
| R2 | **The Common, Saffron Walden** — `2cdef40c`, `c79ca17b`, `9f9ee273`, `1c44311e` | 4 | 🔴 `The Common` spans **444.5 km** across the table |
| R3 | **Off The Beaten Truck, Northstowe** — `2e33ac72`, `adeca7cc` | 2 | 🔴 An operator brand across ≥7 sites, 50 km apart |
| R4 | **The Street** — `fb9fac59` [Elmsett], `2b4b3f54` [Whatfield] | 2 | 🔴 Category name, **different villages** |
| R5 | **All 122 distance-rejected pairs**, incl. `The Bell` [Kesgrave] ↔ `The Bell` [Great Paxton] (102 km) and all three Foxes | — | Distance refutes the name |
| R6 | **43 `Village Hall` rows** | 43 | 🔴 Never a merge target as a group; 113.6 km spread |

---

# THE TREE

🧪 `HEAD = 801de1c`, `origin/main = 08ac368` — local ahead 1 with the previously-committed demo-layout change, still unpushed. **0 staged. Nothing committed, pushed or added.** **No database row inserted, updated or deleted. No migration written. No venue merged, renamed or deleted.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Whether any PROBABLE merge is actually correct.** 0.5–5 km is a judgement band: `Northstowe Tap & Social` at 3.95 km and `The Affleck Arms` at 2.95 km could be two pitches or one. **The rule proposes; it does not know.**
- 🔴 **The 122 distance-rejected pairs may contain real duplicates** whose coordinates are wrong — the `The Bell` [Kesgrave] ↔ [Great Paxton] pair at 102 km is exactly what a bad coordinate looks like. **A merge rule keyed on distance cannot find a duplicate that a bad coordinate has separated**, and I have not attempted to.
- 🔴 **I could not date the linking pass from the data.** `updated_at` never differs from `created_at` on any linked row.
- ⚠️ **Merging is not enough on its own.** Until the creator calls the matcher **and** the linker runs automatically, 2,219 unlinked events carrying old spellings will re-create these rows.
- ⚠️ **`truck_events` counts are for currently-linked rows only.** An operator event whose `venue_id` is null is invisible to the blast-radius count.
- ⚠️ **One venue has no coordinate** and was excluded from every set by design; it could be a duplicate of something and this rule cannot say.
- ⚠️ **The keeper rule prefers a postcode**, but I did not re-validate any keeper's coordinate against postcodes.io in this pass — the tierA corrections are trusted as applied.
