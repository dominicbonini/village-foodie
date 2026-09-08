# Hatches Up ↔ `discovery_events` / `discovery_trucks` — full reconciliation

**8 September 2026 · READ-ONLY · no row inserted, updated or deleted · nothing staged, committed or pushed**

**Marking.** 🔎 source-read · 🧪 executed. **Every database call was a `select`.** No `git add` in any form. The only file written is this report.

**Garbled spans: none. No instruction contradicted another.**

---

## 🔴 SIX OF THE PREVIOUS RUN'S PROPOSALS HAVE ALREADY BEEN APPLIED

🧪 Checked before anything else, because it changes what this report can honestly propose:

| Previously proposed | Status now |
|---|---|
| `5f8f9d76` Buffalo Joe's @ Railway Arms | **GONE** |
| `39996f73` Guerrilla Kitchen @ Railway Arms | **GONE** |
| `6c891367` Nomadough @ Railway Arms | **GONE** |
| `4f5dd5d4` Tikka Tonic @ Railway Arms | **GONE** |
| `7a0781f0` Pizza Mondo @ Railway Arms | **GONE** |
| `fb30a4a8` Nomadough @ bare "Off The Beaten Truck" | **GONE** |
| `cf4c4314` The Noodle & Dumpling Bar @ Railway Arms | 🔴 **STILL PRESENT** — I did not propose it |

🎯 **The Saffron Walden cluster is resolved except for the one row I deliberately left unevidenced.** `discovery_events` now holds **4,283** rows.

---

# STEP 1 — THE SOURCE

🎯 **Queried UNBOUNDED, filtered client-side.** `POST https://api.prod.hatchesup.app/graphql?version=2026-03-02`, `publicCollections(first: 1000)`, **no `bounds` argument**. The map UI was not driven and no bounded query was used for the data.

| | |
|---|---|
| **Collections** | **339** — `hasNextPage: false` |
| **Traders** | **75** |
| **Locations** | **134** |
| Locations with `roughPosition: null` | **15** |
| **Window** | 🎯 **2026-09-08 → 2026-09-15** (8 days) |

Per day: 35 / 42 / 58 / 60 / 57 / 34 / 22 / 31.

🔎 The 15 null-position rows are exactly what a bounded query would have discarded — V1.1's figure, unchanged. **Extraction is non-empty, so the comparison proceeds.**

*Failure mode if this proved nothing:* a truncated first page reads as a complete answer. Ruled out by `first: 1000` against 339 rows and `hasNextPage: false`.

---

# STEP 2 — THE ONLINE-ORDERS FLAG AND COORDINATES

## 🎯 The flag is `trader.setup`, qualified by a `MENU_ONLY` flag — read from their own code

I did not infer this from correlation. 🧪 Recovered from their JS bundle, the exact render rule:

```js
!e.trader.setup || e.flags.includes("MENU_ONLY") ? "✗" : "✓"   //  " Online orders"
```

🎯 **Badge is ✓ iff `trader.setup === true` AND `flags` does not contain `MENU_ONLY`.**

🧪 Against the four you eyeballed — 4/4:

| Trader | `trader.setup` | flags | Badge |
|---|---|---|---|
| **Buffalo Joe's** | `true` | COLLECTION, SLOTTED | ✅ **✓** |
| **Pimp My Fish** | `true` | COLLECTION, SLOTTED | ✅ **✓** |
| **Zaket Potato** | `false` | COLLECTION, SLOTTED | ✅ **✗** |
| **Broadside Pizza** | `false` | COLLECTION, HIDE_PRICES, SLOTTED | ✅ **✗** |

🔴 **Only 16 of the 75 traders show online orders.** That is the single most important number for tiering deletions: for the other 59, Hatches Up is a *listing*, and their coverage of a truck's pitches has no reason to be complete.

⚠️ **A nuance the 4/4 correlation alone would have missed:** `MENU_ONLY` (4 collections) also forces a cross even when `setup` is true. Reading their code rather than fitting the four examples is what surfaced it.

🧪 Other fields checked and rejected as the flag: `available` (339/339 true), `windowOpen` (339/339 true), `link` (present on all 339). None discriminates.

## Coordinates

🧪 **324 of 339 collections carry `roughPosition` as `[lat, lon]`; 15 are null.** Recorded per collection in the analysis and used only to tier additions by distance. 🔎 **No postcode field exists** — V1.1 is right; the `postcode` in their bundle is the search box.

🔴 **I propose no coordinate writes.**

---

# STEP 3 — MATCHING

Matched case-insensitively on a normalised form, truck → date → venue. 🔴 **No stored name was altered; normalisation existed only in memory.**

🧪 **Spelling variants reconciled (whole table — zero occur inside the window):**

| Normalised | Variants |
|---|---|
| `pimpmyfish` | **`Pimp My FIsh` ×183** · `Pimp My Fish` ×3 |
| `villagespice` | `Village Spice` ×17 · `village spice` ×3 |
| `grababurger` | `Grab a Burger` ×13 · `Grab A Burger` ×1 |

⚠️ **V1.1 says 174; it is now 183** — the nine hand-inserted events used the dominant spelling, as V1.1 requires. **The manual is correct and slightly stale on the count.**

⚠️ **Six venue matches are reported as UNCERTAIN and left in no category** rather than forced.

---

# STEP 4 — THE FOUR CATEGORIES

Our in-window rows: **165**.

| | Count |
|---|---|
| **a) AGREE** (truck, date, venue **and** times) | **1** |
| **b) TIME DISAGREEMENT** | **27** |
| **c) IN OURS, NOT IN THEIRS** | **131** |
| **d) IN THEIRS, NOT IN OURS** | **305** |
| *uncertain venue match — uncounted* | 6 |

⚠️ **"AGREE = 1" measures the time offset, not our accuracy.** Because their times are systematically earlier, nearly everything matching on truck/date/venue lands in (b). **Read (a) + (b) = 28 as "same event, both sources".**

## b) Time disagreements — the ordering-window pattern, and the six that break it

🧪 Start-time delta (**ours minus theirs**): **+15 min × 24** — the V1.1 pattern — plus +20 × 3, +10 × 1, −45 × 1, +315 × 1.

🎯 **24 of 30 fit +15 exactly (80%).** The offset is **per-truck, not global**: Buffalo Joe's opens ordering 20 minutes early on all three of its dates; Bonnefirebox 10.

🔴 **Two do not fit the pattern at all and are data problems, not offsets:**

| Date | Truck @ venue | Ours | Theirs |
|---|---|---|---|
| 11 Sep | Elder Street Food @ Wylde Sky Brewery | **16:00–19:00** | 16:45–20:00 — **an hour earlier and an hour shorter; one is simply wrong** |
| 11 Sep | Nomadough @ foodPark Biomedical Campus | **17:00–20:00** | 11:45–14:00 — **a lunchtime pitch against an evening one; a venue-name collision, not a clock error** |

🔴 **I propose no time changes.**

## c) In ours, not in theirs — 131, tiered by what their data can say

| Tier | Meaning | Rows |
|---|---|---|
| **C1** | Truck listed, **shows online orders**, and they list it on that date at a different venue | **6** |
| **C2** | Truck listed, **no online orders**, same date, different venue → weaker | **7** |
| **C3** | Truck listed, silent on that date | **2** |
| 🔴 **C4** | **Truck not in their data at all → cannot be contradicted** | **116** |

**C4 — 116 rows, 34 trucks, proposed for nothing**: Howe & Co (15) · Perky Beans (10) · Marky D's (9) · The Travelling Friar (9) · White Gold (8) · Eat Greek (7) · Big Bite Kebab (6) · The Forge Kitchen (5) and 26 more. 🎯 **89% of category (c). Their absence means only that they do not use Hatches Up.**

🔴 **On inspection, C1 does not survive as a deletion list either.** Row by row it is dominated by **venue-name mismatches, not wrong events**:

| Row | Ours | Theirs | Reading |
|---|---|---|---|
| `bc0ce64e` Azahar 10 Sep | `Off The Beaten Truck - Northstowe` | `Northstowe Green/Square` | **Same pitch, different name** |
| `eacb8726` Pizza Mondo 11 Sep | `Alconbury Weald` | `Off The Beaten Truck - Alconbury Weald` | **Same pitch, different name** |
| `049c50da`, `46ca91f0` Pig-Casso's 11 Sep | `foodPark`, `Biomedical Campus Cambridge` | one `FoodPark - Biomedical Campus Cambridge` | 🔴 **Venue-row duplication — see Step 5** |
| `66f42f2a` Nomadough 11 Sep | `FoodPark Biomedical` | `foodPark Biomedical Campus` | Same pitch, different name |
| `be3fd4b4` Pig-Casso's 11 Sep | `Off The Beaten Truck - Wintringham` 17:00 | evening not listed | Silence |

🎯 **Deleting from C1 would delete real events because we spell the venue differently.** No deletion is proposed from it.

**C2 — all 7 are Zaket Potato**, which shows **no online orders**. See Step 5.

## d) In theirs, not in ours — 305, tiered by distance

🧪 Centre of our live footprint: **52.1688, 0.5732**, from **400** pinned future events.

| Tier | Collections | Trucks | Venue already in `venues` | Would need creating |
|---|---|---|---|---|
| **≤ 40 km** | **42** | **13** | 34 | **8** |
| **≤ 60 km** | **60** | **19** | 35 | **25** |
| ≤ 100 km | 193 | 41 | 66 | **127** |
| 🔴 **Unfiltered** | **305** | 66 | — | **the nationwide drag** |
| No coordinates — cannot be tiered | 14 | — | — | — |

⚠️ **V1.1 records "filtered to 60 km it is 28 events across 10 trucks". Today it is 60 across 19.** Both are correct: the window has moved a day, and the earlier figure additionally excluded any (truck, date) we already held. **The manual is not wrong; it is a different measurement.**

🔴 **THE LIMIT OF THIS TIERING, STATED AND NOT RESOLVED:** the radius is derived from where our map already is. **It can never discover an area we are not already in.** If Village Foodie intends to expand, this filter is the wrong instrument and the radius must come from that intention, not from this data. I have not chosen one.

---

# STEP 5 — THE CASES YOU QUESTIONED BY EYE

## Pig-Casso's, 11 September — 🎯 **a VENUES problem, exactly as V1.1 says. No event deletion proposed.**

🧪 Our three lunchtime rows, and the venue each links to:

| Row | Our `venue_name` | Links to venue | Coordinate |
|---|---|---|---|
| `441be646` | `FoodPark Biomedical` | "FoodPark Biomedical" [Cambridge] | 52.17396, 0.13423 |
| `049c50da` | `foodPark` | "foodPark" [Cambridge] | 52.1751, 0.1415 |
| `46ca91f0` | `Biomedical Campus Cambridge` | "foodPark at The Green & The Gardens … CB2 0AA" | 52.17373, 0.13433 |

🧪 **Pairwise distance between those three venue rows: 26 m, 512 m, 512 m.** 🎯 **They are one place.**
🧪 **Hatches Up shows exactly ONE collection that date: `FoodPark - Biomedical Campus Cambridge`, 11:45–13:45, at 52.17398, 0.13434 — 26 m from our "FoodPark Biomedical".**

🎯 **Verdict: a venues problem.** Three `venues` rows exist for one pitch, and the scraper's matcher has attached the same event to different ones on different runs. 🔴 **Per your instruction I propose no event deletions here.** The fix is to merge the three venue rows and re-point the events — a separate, larger job, since V1.1 records `foodPark` appearing five ways and `Off The Beaten Truck` six.

⚠️ The truck's fourth row that day — `be3fd4b4`, `Off The Beaten Truck - Wintringham`, **17:00–20:00** — is a different time and a separate evening pitch. Not part of this.

## Pizza Mondo, 10 September — 🎯 **two genuine pitches, both corroborated**

| Ours | Theirs |
|---|---|
| `Off The Beaten Truck - The Common` 17:00–20:00 | ✅ `Off The Beaten Truck, The Common` 16:45–20:00 |
| `Darwin Green` 17:00–20:00 | ✅ `Darwin Green` 16:45–20:00 |
| `foodPark` 12:00–14:00 | ✅ `Cambridge North Train Station - FoodPark` 11:45–14:00 |

🎯 **All three of ours are matched by all three of theirs.** The Common and Darwin Green are both evening and both confirmed — **two vans, not one duplicated.** Nothing to delete.

## Zaket Potato — 🔴 **no online orders; their coverage is not expected to be complete**

🧪 `trader.setup = false` → **✗ Online orders**. Their listing shows **one pitch only: `10 Dereham Rd`**, on 8, 9, 10, 11, 12, 14 September. Ours in the window: `The Railway Tavern`, `freethorpe village hall`, `The Fox inn`.

🎯 **Plausibly yes — their listing covers only some of its pitches.** A trader without online orders appears on Hatches Up as a listing, and there is no reason for it to enumerate pitches that take no Hatches Up order. 🔴 **Their silence about The Railway Tavern is weak evidence. I propose no deletions.** ⚠️ It is still possible our seven rows are wrong — a Facebook page read by `scroll_lazy` — but **nothing here distinguishes that from a partial listing**, and that is the honest answer.

## Steak & Honour — 🎯 **six collections missing, and the reason it went quiet is that nothing scrapes it**

🧪 In their data: ✅ 6 collections, **online orders ✓**. In our `discovery_trucks`: ✅ `Steak & Honour`, `excluded=false`, `show_on_vf=true`, aliases `["steak and honour","steak & honor"]`.

**What we are missing — all six:**

| Date | Time | Venue |
|---|---|---|
| 09 Sep | 16:45–20:00 | The Plough Shelford |
| 10 Sep | 17:30–20:15 | Cambridge Wine Merchants |
| 10 Sep | 11:45–14:00 | foodPark, Cambridge Science Park |
| 11 Sep | 16:45–20:00 | The Boot Inn |
| 11 Sep | 11:45–14:00 | foodPark CB1 |
| 12 Sep | 16:45–20:00 | Northstowe |

🔴 **Why it went quiet:** 🧪 our only three events are 5–6 June and all carry `source = 'hatchesup_scraper'` — **a one-off June import.** The truck has **no `URL:` source at all**, so it is not in the discovery scraper's site list and has never been scraped by it. 🎯 **It did not stop working; it was never wired up.** That also means it is *not* one of the 51 `scroll_lazy` failures — a different fault with the same symptom.

## The Noodle & Dumpling Bar, 10 September, Railway Arms — 🔴 **their data has not changed; the estate around it has**

🧪 Still not in their data — **zero traders match `noodle` or `dumpling`.** So Hatches Up still cannot contradict it.

🔴 **What has changed: it is now the ONLY truck left at the Railway Arms on 10 September.** All five siblings from the same `offthebeatentruck.co.uk/saffron-walden` scrape have been deleted. 🧪 The nine remaining "Off The Beaten Truck%" rows that date show **four trucks at The Common** and this one alone at the Railway Arms.

🎯 **That is circumstantial evidence from our own estate, not evidence from Hatches Up**, and I am labelling it as such. It is the one row where I think a judgement call is now reasonable — offered below as a decision for you, not as an evidenced deletion.

---

# STEP 6 — THE SAFFRON WALDEN ARTEFACT ACROSS THE ESTATE

🧪 Scanned the whole table for the shape: **one source URL, one date, one truck, multiple venues** → **515 groups, 1,220 rows across 33 URLs.**

🔴 **But that number is too blunt to act on**, and saying so matters: a truck's own page legitimately lists a lunchtime and an evening pitch. Refining to **the same start time** — one van in two places at once:

🎯 **294 groups, 620 rows, across 28 URLs.** And those split into two different faults:

| Shape | URLs | Rows | Character |
|---|---|---|---|
| 🔴 **VENUE-PAGE** — one page, **many trucks**, every truck assigned to both pitches | **1** | **40** | `offthebeatentruck.co.uk/saffron-walden` — **14 trucks**, dates 25 Jun, 23 Jul, 30 Jul, 6 Aug |
| ⚠️ **TRUCK-PAGE** — one truck's own page, same time, two venue names | **27** | **580** | mostly the same pitch under two names |

**Top truck-page offenders:** `order.pizza-mondo.co.uk` (73 rows) · `order.pimp-my-fish.co.uk` (68) · `markyds.co.uk` (66) · `facebook.com/…61572564125730` — Zaket Potato (62) · `order.pigcassoscatering.co.uk` (56) · `order.nomadough.co.uk` (51) · `perkybeans.co.uk` (34).

🎯 **The venue-page artefact you found is real, is confined to one URL, and its remaining 40 rows are all in June–August — none in the current window.** The much larger truck-page problem is a **different fault with the same fingerprint**: `foodPark` / `FoodPark CB1` / `CB1 Station Road` are one pitch under three names, which is the venues-duplication problem of Step 5, not double-assignment.

🧪 **In the 08–15 September window: 7 groups, 15 rows** — Marky D's ×2, Perky Beans, Nomadough, Pig-Casso's, Pizza Mondo ×2. 🔴 **Proposing nothing here, as instructed — this is scoping a fix.**

---

# WHAT THE EVIDENCE WOULD LOOK LIKE IF IT WERE PROVING NOTHING

| Claim | Hollow signature | How ruled out |
|---|---|---|
| Their data is real | An empty extraction marks all 165 of our rows unmatched | 339 collections, 75 traders, 134 locations; `hasNextPage: false` |
| `trader.setup` is the badge | 4/4 could be coincidence across a binary field | 🎯 Read the render rule out of their bundle — and it surfaced the `MENU_ONLY` qualifier the correlation missed |
| A truck is "absent" | Empty extraction / spelling mismatch / genuine absence all print "not found" | Steak & Honour searched by name, by the `aliases` array, by three spellings, and in the operator `trucks` table before concluding |
| Pig-Casso's is one pitch | Three names could be three real places | 🎯 Measured: 26 m and 512 m apart, and their single listing sits 26 m from ours |
| The Saffron Walden artefact | Both sources disagreeing with no reason | The reason is in our own `source` column: one URL, 14 trucks, both pitches |
| Deletions already applied | The rows might never have existed | Queried the six ids explicitly: 6 GONE, 1 STILL PRESENT — and the one present is the one I did not propose |
| Category (c) is wrong data | A big number reads as a big problem | Tiered: **116 of 131 are trucks their data cannot speak to at all** |

🔴 **Where the two sources disagree, neither is authoritative unless a mechanism can be pointed at.** In this report a mechanism exists in exactly two places — the Saffron Walden venue page, and our duplicate `venues` rows. Everywhere else I have declined to adjudicate.

---

# PROPOSED DELETIONS

🎯 **One, and it is a judgement call rather than an evidenced deletion. Everything else this round is either already applied, a venues problem, or unevidenced.**

| # | Row id | Truck / date / venue | Tier | Reason |
|---|---|---|---|---|
| **1** | `cf4c4314-6005-4817-b9ad-b0aa36d8e361` | The Noodle & Dumpling Bar · 2026-09-10 · `Off The Beaten Truck - The Railway Arms` 17:00–20:00 | 🔴 **Tier 3 — INFERENCE, not evidence** | Last survivor of the eleven-row `offthebeatentruck.co.uk/saffron-walden` double-assignment; its five siblings are deleted and their data shows nobody at the Railway Arms that evening. **But this truck is absent from Hatches Up entirely, so they do not contradict it.** Your call. |

**Deliberately not proposed:** the 6 C1 rows (venue-name mismatches and the Pig-Casso's venues duplication) · the 7 Zaket Potato rows (no online orders → partial listing) · the 2 C3 rows (silence) · the 116 C4 rows (34 trucks absent from Hatches Up) · all 15 in-window Step-6 rows (scoping, not cleanup).

---

# PROPOSED ADDITIONS

🎯 **Tier A — ≤ 40 km, 42 collections, 13 trucks.** Ordered by volume; venue status from the fixed matcher.

| # | Truck | Collections | Orders | Venue |
|---|---|---|---|---|
| **1** | **Steak & Honour** | **6** | ✅ | 5 exist (`Cambridge Wine Merchants` high, `foodPark` high, `The Plough`/`The Boot`/`FoodPark CB1` low) |
| **2** | Al Chile | 8 | ✗ | `Station Square` exists (low) |
| **3** | Ling Ling's Steam Kitchen | 5 | ✗ | 🔴 `Mill Park Road, Cambridge` **needs creating** |
| **4** | Barista Boy Coffee Co | 5 | ✗ | `Flitch Green Food Vendors` exists (high) |
| **5** | Taste of Cambridge | 5 | ✗ | ⚠️ matched `Bury St Edmunds Market` (low) — **almost certainly wrong; treat as needs-creating** |
| **6** | Guerrilla Kitchen | 3 | ✅ | 3 exist (`Cambridge Science Park` high, `FoodPark CB1`/`foodPark` low) |
| **7** | Azahar | 2 | ✅ | `The Green` (high), `foodPark` (low) |
| **8** | Crumbelievable | 2 | ✗ | 🔴 `Cambridge Market` **needs creating** |
| **9** | La Biga Pizzeria | 2 | ✗ | `Haslingfield Village Hall` (high); 🔴 `Chesterton Road (Spar)` **needs creating** |
| **10** | Tacoman | 1 | ✅ | `Thirsty` (high) |
| **11** | Smash and Grab | 1 | ✅ | `Thirsty` (low) |
| **12** | Kerief Catering Ltd | 1 | ✅ | `Cambridge Science Park` (low) |
| **13** | The Rub BBQ | 1 | ✗ | ⚠️ matched `Castle Hedingham Village Hall` (low) — venue is `Hedingham Castle`; **not the same place** |

**Tier B — 40–60 km, 18 collections, 6 trucks:** Broadside Pizza · Charlie's Chippy · Clumsies · Peaky Pizzas · Pecoro On The Road · The Yeerologist. **25 of the 60 ≤60 km collections need a venue created.**

🔴 **Tier C — beyond 60 km: 245 collections. Not proposed.** This is the nationwide drag V1.1 records.

⚠️ **Three cautions before importing any of these.** Several "EXISTS (low)" matches are wrong on inspection (`Taste of Cambridge` → *Bury St Edmunds Market*; `The Rub BBQ` → *Castle Hedingham Village Hall*) — **a low-confidence venue match is not a venue.** Nine of the 13 Tier-A trucks show **no online orders**, so their listings may be partial. And **their times are ordering windows**, 15 minutes early for most trucks, so importing their times would publish an early start.

---

# THE TREE

🧪 `HEAD = 801de1c`, `origin/main = 08ac368` — local ahead 1 with the previously-committed demo-layout change, still unpushed. **0 staged. Nothing committed, pushed or added.** **No database row was inserted, updated or deleted.** The six uncommitted workstreams are untouched.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Whether Zaket Potato's seven rows are right.** They show one pitch; we show three others; the truck has no online orders so their coverage need not be complete. **Nothing available to me settles it**, and it is the largest unresolved block.
- 🔴 **Whether ours or theirs is right wherever they disagree**, absent a mechanism. Both are scrapes.
- 🔴 **The Elder Street Food −45-minute disagreement on 11 September** is unexplained; one source is wrong and I cannot say which.
- ⚠️ **`MENU_ONLY` appears on only 4 collections**, so my reading of its effect on the badge rests on their code, not on observing four crosses that `setup` alone would have shown as ticks.
- ⚠️ **The 60 km radius cannot discover an area we are not in.** Stated, not resolved — it needs a business decision.
- ⚠️ **The 580 truck-page Step-6 rows were classified by shape, not read individually.** Some will be genuine two-pitch days.
- ⚠️ **Venue-existence for additions used the fixed matcher**, whose `low` verdicts are demonstrably unreliable here — two of thirteen were wrong on inspection, so the "34 exist / 8 need creating" split at ≤40 km is optimistic.
