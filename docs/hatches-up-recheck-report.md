# Hatches Up import — re-checked against eight named trucks

**7 September 2026 · report · I wrote nothing, and the import SQL is unchanged**

**Marking.** 🔎 source-read · 🧪 executed. 🔴 **Every call against our database was a `select`.**

---

## 🔴 THE RECONCILIATION, IN ONE PARAGRAPH

All eight trucks **are** in the API response. Six of the eight are **already in our database** — 🧪 **61 future events across the eight, of which 46 already pin.** Only **Tacoman** and **Kerief Catering Ltd** have nothing at all, and my import covers both. So the operator is not seeing eight trucks we lack; he is seeing eight trucks we mostly have. **The gap is 2 trucks with no events, and 15 events that exist but cannot pin because their `venue_id` is NULL.**

**And I found a real bug in my own query, which I must report even though it cost nothing here.**

---

# 🔴 THE BUG: MY BOUNDING BOX SILENTLY DROPPED 15 COLLECTIONS

🧪 Re-run today, same endpoint, same window:

| Query | Nodes | hasNextPage |
|---|---|---|
| **UK-wide bounding box** (what I used) | **306** | false |
| **No bounds at all** | **321** | false |
| Tight Cambridge box | 109 | false |

🧪 **15 collections are in the unbounded result and not in mine.** The cause, confirmed by re-querying with `roughPosition` selected: 🔴 **all 15 have `location.roughPosition = null`.** A location with no coordinates cannot be tested against a box, so **any** `bounds` argument silently excludes it. Nothing in the API says so.

🔴 **One of them is a named truck: `Elder Street Food @ Puckeridge Pony Club`, 12 September.** Puckeridge is local — this is not a Scotland edge case.

**What it actually cost: nothing.** 🧪 Each of the 15 checked against the import rules:

| Collection | Verdict |
|---|---|
| Skipper's Scran Van × 8 (Kirkcudbright), Monster Munchies × 3 (Glasgow) | tracked, but ~500 km away — the geographic rule drops them |
| Dirty Chicks Hummus (Stamford) | not tracked |
| Pecoro On The Road × 2 | truck excluded |
| **Elder Street Food @ Puckeridge Pony Club** | 🧪 **already held** — `"Puckeridge Pony Club" 18:00–22:00` |

⚠️ **But the method was wrong and would have cost something on a different day.** The right query is **unbounded**, filtered client-side; `bounds` is an optimisation that quietly discards coordinate-less venues. Every number in this report uses the **unbounded 321**.

*Failure mode if this proved nothing:* comparing two runs minutes apart could show a difference caused by the data changing. The 15 are a strict subset of the unbounded result with a shared, checkable property — `roughPosition: null` — not a timing artefact.

---

# TASK 1 — ALL EIGHT, INDIVIDUALLY

| Truck | HU collections | Outcome |
|---|---|---|
| **Tacoman** | 1 | ✅ **1 INCLUDED** (Thirsty, Cambridge, 8 Sep) |
| **Azahar** | 2 | ✅ 1 included (foodPark CB1, 9 Sep) · 1 already-held |
| **The Purple Pepper** | 3 | 🔴 **all 3 already-held** |
| **Kerief Catering Ltd** | 1 | ✅ **1 INCLUDED** (foodPark Science Park, 10 Sep) |
| **Pizza Mondo** | 9 | ✅ 3 included · 6 already-held |
| **Nomadough** | 4 | 🔴 **all 4 already-held** |
| **Pigcassos** → our `Pig-Casso's` | 1 | 🔴 already-held |
| **Elder Street Food** | 2 | 🔴 1 already-held · 1 dropped by the bounding-box bug **and also already-held** |

🎯 **Every one of the eight is tracked, none is excluded, and none was dropped by the 60 km radius.**

## 🔴 The Purple Pepper and Elder Street Food — why they were in no list

**They were dropped as already-held, and my report reported that category as a bare count — "37 events" — without naming a single truck.** The included 10, the excluded 14 and the untracked 3 were all named; the largest drop was not. That is a reporting failure, not a logic one: both trucks were correctly identified, correctly matched, and correctly skipped.

🧪 What we hold against what they list:

| Date | HU | We hold |
|---|---|---|
| **The Purple Pepper** | | |
| 09 Sep | Cambourne Business Park … CB23 6DW, 11:30–14:00 | `Cambourne Business Park` 11:45–14:00 |
| 10 Sep | The White Swan Bluntisham PE28 3LD, 16:45–20:00 | `The White Swan` 17:00–20:00 |
| 11 Sep | The Brewery Tap Waterbeach CB25 9PB, 16:45–20:00 | `The Brewery Tap` 17:00–20:00 |
| **Elder Street Food** | | |
| 11 Sep | Wylde Sky Brewery, Linton, 16:45–20:00 | `Wylde Sky Brewery` 16:00–19:00 |
| 12 Sep | Puckeridge Pony Club, 17:45–22:00 | `Puckeridge Pony Club` 18:00–22:00 |

🎯 **Same venue, same date, every time.** The only differences are HU's longer venue strings and the 15-minute ordering-window offset — except Wylde Sky Brewery on 11 Sep, where ours says 16:00–19:00 against their 16:45–20:00. **Ours is probably stale there; I have not changed it.**

## Pigcassos and Nomadough — confirmed against the live database

🧪 **Pigcassos → `Pig-Casso's`**, 11 September, HU `FoodPark - Biomedical Campus Cambridge` 11:45–13:45. We hold **three** rows that date: `FoodPark Biomedical`, `foodPark`, `Biomedical Campus Cambridge`, all 12:00–13:45. 🔴 **That is one event stored three times under three names** — our own duplication, not a disagreement with HU. Importing a fourth would make it worse.

🧪 **Nomadough**, all four already-held:

| Date | HU | We hold |
|---|---|---|
| 10 Sep | foodPark Cambridge Science Park 11:45–14:00 | `foodPark` 12:00–14:00 |
| 10 Sep | Off the beaten truck- on the common 16:45–20:00 | `Off The Beaten Truck - The Common` + `Off The Beaten Truck` 17:00–20:00 |
| 11 Sep | The bull 16:45–20:00 | `The Bull` 17:00–20:00 |
| 11 Sep | foodPark Biomedical Campus 11:45–14:00 | `FoodPark Biomedical` 12:00–14:00 |

🎯 **Multi-van truck, not a disagreement and not staleness** — Nomadough genuinely runs a lunchtime foodPark slot and an evening pitch on the same day, and both sources agree on both.

---

# TASK 2 — IS THE QUERY SEEING WHAT THE MAP SEES?

**2a.** 🧪 `POST https://api.prod.hatchesup.app/graphql?version=2026-03-02`, `publicCollections(first: 1000)`, bounds `{sw:{lat:49.5,lon:-8.7}, ne:{lat:61.0,lon:2.0}}` → **306 nodes, `hasNextPage: false`**. Unbounded, same `first` → **321, `hasNextPage: false`**.

**2b.** 🧪 Tested for hidden limiting: no per-trader cap (Pig-Casso's returns 1, Pizza Mondo 9), no status or visibility argument in the schema the site itself uses, and `first: 1000` is not being truncated — both results are well under it and report no next page. 🔴 **The only parameter that limits beyond geography is `bounds` itself**, via the null-coordinate exclusion above.

**2c.** 🧪 A tight Cambridge box (51.7–52.9 N, −0.6–1.8 E) returns **109 nodes, every one of them also in the UK-wide 306** — zero present in the narrow view and absent from the wide one. 🎯 **So the map's default view cannot show a collection my UK-wide query missed on geographic grounds.** The only thing it misses is coordinate-less locations — which the map cannot pin either, though its list view may well show them. **That is the honest answer: the query was wrong, but not in a way the map would expose as a missing pin.**

**2d.** 🧪 **Date range unchanged: 2026-09-07 → 2026-09-14.** Eight days, per day 20 / 34 / 40 / 55 / 55 / 51 / 30 / 21.

---

# TASK 3 — THE 60 KM FILTER

🧪 Every one of the eight, distance from the median centre (52.1688, 0.5732):

| Truck | Distances |
|---|---|
| Pizza Mondo | 21 · 28 · 29 · 30 · 33 · 38 · **60** km |
| Elder Street Food | 22 km · *(1 with no coordinates)* |
| Nomadough | 28 · 30 · 38 · 38 km |
| Azahar | 30 · 38 km |
| Kerief Catering Ltd | 30 km |
| Pigcassos | 30 km |
| Tacoman | 31 km |
| The Purple Pepper | 29 · 44 · 44 km |

🎯 **All eight fall inside 60 km. The radius dropped none of them.** One sits exactly on the boundary — Pizza Mondo at *Off The Beaten Truck – Alconbury Weald*, 60 km — and it was dropped as already-held regardless.

**Recommendation, not a change:** 🔴 **leave R = 60 km as it is for this import.** It cost nothing here, and the evidence for widening is absent — the trucks beyond it are in London, Newcastle, Edinburgh and Cornwall. ⚠️ But your point stands: R is derived from where the map is *today*, so it is self-reinforcing — it can never discover an area you are not already in. **If you intend to expand, R must be set from that intention, not from this data, and I cannot derive it.**

---

# 🔴 ON YOUR MESSAGE: "the Hatches Up site has coordinates listed already, use that"

**I am, where they are unambiguous — and I checked whether they can do more.**

🎯 **Already using them:** all three new venues store **Hatches Up's own coordinate**, not a postcode centroid, because theirs is the more precise of the two (measured max error 127 m). Each passed the geo-validate gauntlet and sits within 56 m of a real postcode.

🔴 **Deliberately not using them for matched venues** — the previous instruction was explicit: *"keep OUR venue_id and OUR coordinates … the 54 corrections were just applied and must not be undone."* No `UPDATE` to `venues` exists anywhere in the SQL.

**And I tested whether their coordinates could rescue the 15 events that cannot pin. They cannot, safely.** 🧪 Of the 15: **5 are venues Hatches Up does not list at all** (*The White Swan*, *Little Thetford Village Hall*, *Pidley Community Centre*, *IVO Brewery*, *Puckeridge Pony Club* — the last has a listing but **no coordinates**). The other 10 matched only through a loose token overlap, and 🔴 **inspecting them showed the matches are wrong**:

- `"Off The Beaten Truck - Wintringham"` → their *"Off the beaten truck- on the common"* — **Wintringham is St Neots, the Common is Saffron Walden, ~50 km apart.**
- A bare `"foodPark"` → their *"foodPark, CB1"* — but we hold **four** distinct foodParks (CB1, Science Park, Biomedical, Genome). A bare name cannot choose between them.

**So their coordinates are excellent and their venue names are as ambiguous as ours.** Using them here would have re-created exactly the mislink class the last week removed. **The 15 need `venue_id` resolved by the matcher, not coordinates copied by name.**

---

# TASK 4 — REVISED SQL: NONE NEEDED

🔴 **Task 1 found no event that should have been included and was not.** Every one of the 28 rows re-verified against the live database just now:

| | |
|---|---|
| Event rows in the generated SQL | **28** |
| 🧪 Exact-key collisions (would no-op) | **0** |
| 🧪 (truck, date) now held — would create a second pin | **0** |
| Trucks | 10 |

**The existing files stand unchanged**, in `docs/sql/hatches-up-import-20260907/`: **3 venue inserts · 28 event inserts · 0 `UPDATE` anywhere · `DELETE` only in the rollback ·** every insert guarded `ON CONFLICT … DO NOTHING`, source `'Manual import 2026-09-07: hatchesup.co.uk'`, snapshot and rollback included. Nothing was regenerated, so nothing needs re-reading.

🧪 **Fresh baseline:** future events **688**, pinnable **396**, venues **574**. After the import: **+28 events, +3 venues**, and Tacoman and Kerief Catering gain their first future events.

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No table was written.** The only file created is this report; the import SQL is untouched from the previous task. Every other uncommitted workstream unchanged.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **What the operator's screen actually shows.** I compared the API against our database; I did not view the rendered map. If he is reading the **list** rather than the map, coordinate-less collections such as *Puckeridge Pony Club* would appear to him and never appear as a pin for us — and that difference is invisible from here.
- 🔴 **Whether `bounds` has other exclusions** beyond null coordinates. I proved that one; I did not enumerate the argument's full behaviour, and introspection is disabled.
- ⚠️ **Whether our `Wylde Sky Brewery` 16:00–19:00 on 11 September is stale.** HU says 16:45–20:00. **The two disagree by more than the 15-minute ordering offset**, so one of them is wrong and I did not determine which.
- ⚠️ **Pig-Casso's has one event stored three times** under three venue names on 11 September, and Nomadough similarly. That is our own duplication, pre-dating this import; I have neither counted the full extent of it nor proposed a fix.
- ⚠️ **The 15-minute offset remains inferred**, not confirmed by any label in their API.
- ⚠️ **I did not re-derive the 60 km radius** or test whether a different centre (say, weighted by operator trucks rather than all pinned events) would move it.
