# Hatches Up — one-off event import

**7 September 2026 · SQL prepared for you · I wrote nothing**

**Marking.** 🔎 source-read · 🧪 executed. 🔴 **Every call against our database was a `select`. I wrote to no table.** The Hatches Up and postcodes.io calls were read-only queries.

---

## 🔴 THE IMPORT IS 28 EVENTS, NOT 221 — AND THAT IS THE FINDING

The obvious version of this import — everything for trucks we track — is **221 events across 47 trucks**. 🧪 I built it, measured it, and it would have created **45 venues**, of which the largest are **Camden Stables Market, Old Spitalfields Market, Pop Brixton, Westfield Stratford, Grainger Market (Newcastle), White Cloth Hall (Leeds), Shambles Market (York), Bowhouse Market (Fife), Leith Walk Police Box (Edinburgh), Dunbar Harbour, The Food Barn (Falmouth)**.

🔴 **That is exactly the nationwide drag I flagged in the source report, and it is worse than I predicted** — because Hatches Up is a national platform and 42 of the 68 traders we "track" are in `discovery_trucks` only as a side-effect of the June import. They trade in London, Newcastle, Leeds, Edinburgh and Cornwall. They are not Village Foodie's market.

🧪 So I filtered geographically, using **our own live footprint** rather than a guess:

| | |
|---|---|
| Pinned future events on the map today | 390 |
| Distance from their median centre (52.169, 0.573) | p50 **24 km** · p90 **55 km** · p95 **63 km** |

**R = 60 km**, sitting between p90 and p95 of where the map actually is.

| Radius | Events | Trucks | Locations |
|---|---|---|---|
| 40 km | 13 | 7 | 9 |
| **60 km** | **28** | **10** | **13** |
| 100 km | 136 | 28 | 35 — 🔴 pulls in London |
| 150 km | 152 | 32 | 42 |

**The honest number is 28 events, 10 trucks, 3 new venues.** Small. It is a stopgap for a broken scraper, not a data source.

---

# PART 1 — FETCH AND SCOPE

## 1a. Fetched via the API, not the map

🎯 **I used the GraphQL API directly**, as instructed — `https://api.prod.hatchesup.app/graphql?version=2026-03-02`, the `publicCollections` query with `bounds: {sw:{lat,lon}, ne:{lat,lon}}` recorded in the source report. **One POST with a UK-wide box returned everything**; the map never needed driving, and it is one request against their servers instead of dozens of tile-and-zoom fetches.

🧪 **306 collections · 71 traders · 119 locations · `hasNextPage: false`.**
🧪 **Date range returned: 2026-09-07 → 2026-09-14** — eight days, not seven. Per day: 20 / 34 / 40 / 55 / 55 / 51 / 30 / 21.

*Failure mode if this proved nothing:* a partial page would look like a complete answer. `hasNextPage: false` on a `first: 1000` request is the check, and 306 < 1000.

## 1b. Filtered to trucks we track

🧪 Matched on `discovery_trucks.name` **and the `aliases` array**, both normalised:

| | Events |
|---|---|
| Trucks we track | **301** |
| 🔴 Trucks we do **not** track — dropped | **5** across 3 traders |

**Not imported:** `Bangkok Box` · `Dirty Chicks Hummus` · `Safari Shack`.

Two further drops, both deliberate:

| Dropped | Events | Why |
|---|---|---|
| Truck is `excluded` in `discovery_trucks` | **43** | It would never display. 14 traders: *Al Chile, Charlie's Chippy, Ling Ling's Steam Kitchen, Guerrilla Kitchen, Taste of Cambridge, TIKKA TONIC, Smash and Grab, The Angry Seagull Fish + Chips, The Pizza Pod, Pecoro On The Road, La Biga Pizzeria, The Kentucky Cookout, The Rub BBQ, The Wood Oven* |
| 🔴 We already hold a row for that (truck, date) | **37** | Avoids near-duplicates — see below |

🔴 **The already-held drop matters more than it looks.** HU names venues differently from our scraper — *"Mandeville Hall Burwell"* against our *"Mandeville Hall"*. The natural key is `(event_date, truck_name, venue_name)`, so those **would not collide** and `ON CONFLICT` would not save us: we would get two rows and two pins for one event. Dropping any (truck, date) we already hold is the only safe rule, and it is why the nine Pimp My Fish events you inserted by hand are untouched.

## 1c. Which silent trucks gain events

🧪 Of the 10 trucks in the final import, **one is from the 51 silent list: `Tacoman`** (1 event, last written 19 August).

The other nine currently have **no future events at all** but were never in the "51" because they have no scraped history to have gone silent from: `The Yeerologist` · `Buffalo Joe's` · `Barista Boy Coffee Co` · `Azahar` · `Clumsies` · `Kerief Catering Ltd` · `Broadside Pizza` · `Crumbelievable` — plus `Pizza Mondo`, which already has future events and gains more.

⚠️ **So this import barely touches the 51.** The wider set would have reached 44 zero-event trucks, but almost all of them trade outside the map's area. **The 51 need the run log, not this.**

## 1d. Contradictions with what we already hold

🧪 Compared every HU collection against our rows for the same truck and date. Two classes, both real:

**Systematic time offset — HU publishes the ORDERING window, the truck's own site the TRADING window.** Consistently 15 minutes earlier:

| Date | Truck @ venue | HU | Ours |
|---|---|---|---|
| 09 Sep | Pimp My Fish @ Great Shelford Memorial Hall | 16:45–19:45 | 17:00–19:45 |
| 10 Sep | Pizza Mondo @ Off The Beaten Truck, The Common | 16:45–20:00 | 17:00–20:00 |
| 11 Sep | Nomadough @ The Bull | 16:45–20:00 | 17:00–20:00 |

🔴 **This is why the already-held drop is right.** Importing HU's times over ours would move published start times 15 minutes earlier and tell customers to arrive before the truck opens.

**Genuine venue disagreements**, where HU and we place the same truck somewhere different on the same day — most involve multi-van trucks (*Nomadough*, *Pizza Mondo*, *Zaket Potato* at both `10 Dereham Rd` and `The Railway Tavern`). 🧪 **All are inside the already-held drop, so none is imported.** I have not tried to adjudicate them.

---

# PART 2 — VENUES

## 2a. Through the fixed matcher

🧪 The 62 distinct locations in the pre-geographic set, through `findVenue`: **6 high, 11 low, 45 unmatched.** 🔴 The low matches are why an unfiltered import must not run:

| Distance | HU location | → would have linked to |
|---|---|---|
| 🔴 **570.7 km** | The Shack, Isla Street, **Dundee** | "Auto Shack at the Corner Garage" [Shotley] |
| 🔴 **264.8 km** | Darley Street Market (**Bradford**) | "The Street" [Whatfield] |
| 🔴 **213.0 km** | Stone Street Square, **Dudley** | "The Street" [Whatfield] |
| 🔴 **95.9 km** | Green Choy, **Tooting** Market | "The Green" [Northstowe] |

The name-smashing normaliser strips `street`, so *Darley Street Market* and *Stone Street Square* both collapse toward *"The Street"*. **All of these are outside R = 60 km and are excluded.**

Inside R = 60 km the low matches are all genuinely the same place — 0.21 km, 0.72 km, 2.13 km — and I re-resolved each by proximity.

## 🔴 A defect I found and fixed in my own selection

My first proximity rule was **nearest-wins**, and 🧪 it chose **"Cambridge Train Station" (55 m)** over **"FoodPark CB1" (86 m)** for HU's *"foodPark, CB1"* — wrong by 31 metres. Corrected to **name-overlap first, distance as tie-break**:

| HU location | → resolved | Overlap | Distance |
|---|---|---|---|
| foodPark, CB1 | **FoodPark CB1** [Cambridge] | 1.00 | 86 m |
| foodPark Cambridge Science park | **FoodPark Science Park** [Cambridge] | 0.75 | 101 m |
| Thirsty | **Thirsty** [Cambridge] | 1.00 | 717 m |
| Cambridge Market | ⚠️ **"bank Holiday Monday"** [Cambridge] | 0.00 | 121 m |

⚠️ **The last one is ugly and I am flagging rather than hiding it.** *Cambridge Market* resolves to an existing row junk-named *"bank Holiday Monday"* 121 m away. The pin is right and 🔎 the map displays `discovery_events.venue_name`, not the venue row's name, so nothing user-facing shows the junk — but the link is to a badly-named row. **Say the word and I will make it a new venue instead.**

## 2b. Our venue rows are not touched

🔴 **No `UPDATE` to `venues` exists anywhere in this SQL** — 🧪 verified mechanically: **0 `UPDATE` statements across all eight files.** For every matched location the event takes **our** `venue_id` and therefore **our** coordinates. **The 54 corrections you just applied cannot be undone by this import.**

## 2c / 2d. The three new venues — the complete list

🧪 Only three locations inside R = 60 km have nothing of ours within 500 m. Each was validated **through the geo-validate gauntlet** and reverse-geocoded to a real postcode:

| Venue | Coordinate | Gauntlet | Nearest real postcode | Village taken from |
|---|---|---|---|---|
| **The Yeerologist @ Eat17** | 51.869906, 0.161540 | ✅ PASS | **CM23 3AS** (56 m) | parish **Bishop's Stortford** |
| **Mrs Salisburys Carpark** | 51.778402, 0.675606 | ✅ PASS | **CM8 3NJ** (51 m) | parish **Wickham Bishops** |
| **Daisy's Milk Shed** | 52.523073, 1.010511 | ✅ PASS | **NR17 1YG** (0 m) | parish **Attleborough** |

🎯 **3 of 3 pass; 0 rejected.** All three sit within 56 metres of a real postcode — consistent with the 127 m maximum measured earlier.

🔴 **The village comes from the postcode's parish, never from the venue name** — the failure mode that put 24 venues in the table with `village = name`.

⚠️ **I stored HU's coordinate, not the postcode centroid.** Theirs is the more precise of the two (a postcode centroid is not a building) and it passed every check; the postcode is stored alongside so a future correction has an authoritative anchor.

---

# PART 3 — THE SQL

📁 **`docs/sql/hatches-up-import-20260907/`** — visible in Cursor.

| File | Rows |
|---|---|
| `00-snapshot.sql` | 0 — **run first** |
| `01-verify-before.sql` | 0 |
| `02-venues.sql` | **3 venue inserts** |
| `03/04/05-events-chunk-*.sql` | **10 + 10 + 8 = 28 event inserts** |
| `06-verify-after.sql` | 0 |
| `07-rollback.sql` | the only `DELETE` |

🧪 Verified mechanically: **28 event rows · 3 venue rows · 0 `UPDATE` statements anywhere · `DELETE` only in the rollback file · every event insert guarded `ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING` · the venue insert guarded `ON CONFLICT (name, village) DO NOTHING`.** 🔴 **Nothing updates and nothing deletes outside the rollback.**

**3b — re-runs are no-ops.** Both guards are natural-key `DO NOTHING`, so running a chunk twice inserts nothing, and the scraper recovering cannot duplicate these.

**3c — spelling.** 🧪 Three traders differ between HU and our pipeline: `Pimp My Fish → Pimp My FIsh` · `TIKKA TONIC → Tikka Tonic` · `Pigcassos → Pig-Casso's`. 🎯 **All three fall outside the final import** (Pimp My Fish already held, Tikka Tonic excluded, Pig-Casso's already held), so **no spelling substitution is applied to any of the 28 rows**. The generator applies the rule regardless — for each truck it uses the dominant existing `discovery_events.truck_name`, falling back to `discovery_trucks.name` for the nine trucks with no history — so a future run of the same tooling stays correct.

**3d — source.** Every row carries **`'Manual import 2026-09-07: hatchesup.co.uk'`**. 🎯 It does not match `URL:%`, so the staleness sweep still parses no URL or strategy for these trucks and **still reports them as broken. They are.**

**3e — rollback** keys on that source string, so a genuinely scraped row arriving later for the same event is never caught by it. The three venues are listed with a reference count and their `DELETE` is commented out.

---

# PART 4 — BEFORE AND AFTER

**Before** — 🧪 measured now:

| future_events | with_venue_id | pinnable | distinct trucks | venues |
|---|---|---|---|---|
| **678** | **390** | **390** | — | **574** |

**After** — expect **+28 events, +28 pinnable, +3 venues**, and up to **+9 trucks** on the map.

## 🔴 What will still be missing — do not read a partial result as failure

| Still missing | Why |
|---|---|
| **~278 future events with no pin** | Low-confidence links you are still reviewing, plus events whose venue has no coordinates |
| **The 51 silent trucks — 50 of them** | Only *Tacoman* is in this import. 🔴 **This import does not fix the scraper and barely touches them.** |
| **193 HU events for trucks trading outside 60 km** | Deliberately excluded. Importing them would drag the map to London, Newcastle and Edinburgh |
| **43 HU events for excluded trucks** | They would never display |
| **37 HU events for (truck, date) we already hold** | Dropped to avoid double pins and 15-minutes-early times |
| **Anything after 14 September** | Their API returned eight days; that is the whole horizon |
| **Everything, from 15 September** | 🔴 **This is a one-off. It does not repeat, and nothing refreshes it.** |

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No table was written by me.** The only files created are the eight SQL files under `docs/sql/hatches-up-import-20260907/` and this report. Tree: **26 modified / 91 untracked**; every other uncommitted workstream untouched.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Whether reading their API is acceptable to Hatches Up.** Unchanged from the source report: `robots.txt` is `Allow: /`, there is **no terms-of-use page at all**, and the footer asserts copyright. **This import is a commercial judgement I cannot make for you**, and it is now an actual copy of their data rather than a measurement of it.
- 🔴 **Whether the 28 events are true.** They are HU's listings, unverified against each truck's own site. 🧪 The one case I *did* cross-check earlier — Pimp My Fish — matched exactly, which is mild evidence for the rest and no more.
- 🔴 **The 15-minute offset is inferred, not confirmed.** Ordering-window-versus-trading-window fits every case I looked at, but HU does not label the field. **If it is wrong, these 28 start times are 15 minutes early.**
- ⚠️ **R = 60 km is derived from where the map is today**, not from where the business wants to be. If Village Foodie is expanding, it is the wrong filter and the number should be re-derived.
- ⚠️ **`Cambridge Market` links to a junk-named venue row** 121 m away. Correct pin, ugly link.
- ⚠️ **`Thirsty` resolves at 717 m** — the loosest accepted match. Same name, same city, but I did not confirm it is the same site.
- ⚠️ **Nine of the ten trucks have no scraped history**, so their `truck_name` comes from `discovery_trucks.name`. If the scraper ever recovers and writes a different spelling, those will not collide and will duplicate — the Pimp My Fish problem in reverse, and unavoidable without knowing what the Sheet calls them.
- ⚠️ **I did not verify the SQL by running it.** The counts are predictions from measured state.
