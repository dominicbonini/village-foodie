# Hatches Up vs our `discovery_events` — comparison

**8 September 2026 · READ-ONLY · no row created, updated or deleted · nothing staged, committed or pushed**

**Marking.** 🔎 source-read · 🧪 executed. **Every database call was a `select`.** No `git add` in any form.

**Garbled spans: none. No instruction contradicted another.**

---

# STEP 1 — THE SOURCE

## 🔴 The served HTML carries no truck data at all

🧪 `GET https://hatchesup.co.uk/find-food/?view=map&when=7days` → **HTTP 200, 23,336 bytes**. Searched for every field the comparison needs:

| String | Occurrences in the served HTML |
|---|---|
| `roughPosition` | **0** |
| `collectionWindowStart` | **0** |
| `trader` | **0** |
| `latitude` | **0** |
| `"date"` | **0** |

🎯 **It is a Next.js shell. The RSC payload is 11,175 characters and contains no collection.** Per your stop condition I did **not** compare against it — an extraction of zero would have reported all 171 of our in-window rows as unmatched, which is indistinguishable from our data being wrong.

## The route I used: their GraphQL API, UNBOUNDED

🎯 **`POST https://api.prod.hatchesup.app/graphql?version=2026-03-02`**, the `publicCollections` query the site itself sends, **with no `bounds` argument**, filtered client-side.

🧪 **V1.1's warning re-verified today, not taken on trust:**

| Query | Collections |
|---|---|
| **Unbounded** | **339** |
| UK-wide bounded | 324 |
| 🔴 **Dropped by `bounds`** | **15** |
| Of those 15, `roughPosition` is null | 🎯 **15 of 15** |

**The manual's claim holds exactly.** Had I used a bounded query I would have silently lost 15 collections.

## Counts extracted

| | |
|---|---|
| **Trucks (distinct trader names)** | **75** |
| **Dated events (collections)** | **339** — every one carries a date |
| Distinct locations | 134 |
| Locations with a null position | 15 |
| `hasNextPage` | `false` — so 339 is the whole set, not a first page |

*Failure mode if this proved nothing:* a truncated first page looks like a complete answer. Ruled out by requesting `first: 1000` against a result of 339 and by `hasNextPage: false`.

---

# STEP 2 — THE WINDOW

🎯 **2026-09-08 → 2026-09-15**, eight days. 🧪 Per day: 35 / 42 / 58 / 60 / 57 / 34 / 22 / 31.

🔴 **Every comparison below is confined to those eight dates.** Our `discovery_events` run to November; their silence about 16 September or later is not evidence of anything. Our in-window row count: **171**.

---

# STEP 3 — MATCHING, AND THE SPELLINGS I HAD TO RECONCILE

Matched truck-first (case-insensitively, on a normalised form), then date, then venue. 🔴 **No stored name was normalised or altered — normalisation happened only in memory, for comparison.**

🧪 **Spelling variants in the window: zero.** Across the **whole table**, three names carry more than one spelling:

| Normalised | Variants held |
|---|---|
| `pimpmyfish` | **`Pimp My FIsh` ×183** · `Pimp My Fish` ×3 |
| `villagespice` | `Village Spice` ×17 · `village spice` ×3 |
| `grababurger` | `Grab a Burger` ×13 · `Grab A Burger` ×1 |

✅ The manual's `Pimp My FIsh` figure was 174; it is now **183** — the nine hand-inserted events used the dominant spelling, exactly as V1.1 requires. **The manual is right and slightly stale on the count.**

## 🔴 A MANUAL CLAIM I NEARLY CONTRADICTED IN ERROR

Mid-analysis my own output showed `Zaket Potato` with `… | Strategy: ` and nothing after it, which would have contradicted V1.1's *"a sweep of all 4,231 discovery events finds zero trucks with an empty strategy"*. 🧪 **I re-read the untruncated value before reporting it: `"URL: https://www.facebook.com/profile.php?id=61572564125730 | Strategy: scroll_lazy"`.** My display was cut at 72 characters.

🧪 Checked properly across every row: **rows whose full `source` ends `Strategy:` with nothing after it = 0.** **V1.1 is correct.** This is the identical truncation artefact V1.1 records as having once sent an operator to edit a Sheet row that was never wrong.

---

# STEP 4 — THE FOUR CATEGORIES

| | Count |
|---|---|
| **a) AGREE** — truck, date, venue **and times** | **1** |
| **b) TIME DISAGREEMENT** — truck, date, venue match; times differ | **30** |
| **c) IN OURS, NOT IN THEIRS** | **137** |
| **d) IN THEIRS, NOT IN OURS** | **305** |
| *(venue match uncertain — not counted in any category)* | 3 |

⚠️ **"AGREE = 1" is not a measure of our accuracy.** Because their times are systematically 15 minutes earlier (below), almost everything that agrees on truck, date and venue lands in (b) rather than (a). **(a) + (b) = 31 is the real "same event, both sources" figure.**

## b) Time disagreements — the 15-minute pattern holds for 80%

🧪 Start-time delta, **ours minus theirs**:

| Delta | Count |
|---|---|
| **+15 min** | 🎯 **24** — the V1.1 ordering-vs-trading pattern |
| +20 min | 3 |
| +10 min | 1 |
| −45 min | 1 |
| +315 min | 1 |

🎯 **24 of 30 (80%) fit +15 exactly.** The six that do not:

| Date | Truck @ venue | Ours | Theirs | Note |
|---|---|---|---|---|
| 08 Sep | Buffalo Joe's @ Bishop's Stortford Cricket Club | 17:00–20:00 | 16:40–20:00 | **+20** — Buffalo Joe's opens ordering 20 min early, consistently |
| 10 Sep | Buffalo Joe's @ OTBT The Common | 17:00–20:00 | 16:40–20:00 | +20 |
| 12 Sep | Buffalo Joe's @ The Yew Tree | 17:00–20:00 | 16:40–20:00 | +20 |
| 09 Sep | Bonnefirebox @ Coach and Horses | 17:00–20:10 | 16:50–20:10 | +10 |
| 11 Sep | Elder Street Food @ Wylde Sky Brewery | **16:00–19:00** | 16:45–20:00 | 🔴 **−45. Ours is an hour earlier and an hour shorter — one of the two is simply wrong** |
| 11 Sep | Nomadough @ foodPark Biomedical Campus | **17:00–20:00** | **11:45–14:00** | 🔴 **+315. A lunchtime pitch against an evening one — a venue-name collision, not a time error** |

🎯 **So the pattern is real and per-truck rather than global**: most publish ordering 15 minutes early, Buffalo Joe's 20, Bonnefirebox 10. 🔴 **I am not proposing we adopt any of their times**, as instructed. The last two rows are flagged as data problems of ours, not offsets.

## c) In ours, not in theirs — 137, tiered by what their data can actually say

🔴 **A truck they do not list cannot have its dates contradicted by them.** Tiering on that principle:

| Tier | Meaning | Rows |
|---|---|---|
| **1** | Truck listed **and** they list it on that **date**, at a different venue → genuine contradiction | **19** |
| **2** | Truck listed, but they are silent on that date | **2** |
| 🔴 **3** | **Truck not in their data at all → no evidence whatsoever** | **116** |

**Tier 3 — 116 rows, 34 trucks, proposed for nothing:** Howe & Co (15) · Perky Beans (10) · Marky D's (9) · The Travelling Friar (9) · White Gold (8) · Eat Greek (7) · Big Bite Kebab (6) · The Forge Kitchen (5) · Wagyu Burgers (4) · Pigs In (4) · and 24 more with 1–3 rows each. 🎯 **These are 85% of category (c), and their absence from Hatches Up says only that they do not use Hatches Up's ordering platform.**

**Tier 2 — 2 rows:** Elder Street Food 08 Sep, Pig-Casso's 10 Sep. Silence within the window is weak evidence; not proposed.

**Tier 1 — 19 rows**, dominated by two clusters: seven `Zaket Potato` rows where they show `10 Dereham Rd` and we show `The Railway Tavern`/`freethorpe village hall`/`The Fox inn`, and the Saffron Walden cluster below.

## d) In theirs, not in ours — 305 collections, 66 traders

🧪 Only **3** are traders we already hold events for in this window (Zaket Potato 11, Guerrilla Kitchen 3, Azahar 2). The other **63 traders have no events of ours at all in the window** — led by Green Choy (23), Kerbside Kitchen (12), Al Chile (8), Beardus Burger (8), Kushi London (8).

⚠️ **Most of these are outside our area.** The last import found an unfiltered Hatches Up import would create 45 venues nationwide. **Reported only; nothing inserted.**

---

# STEP 5 — THE THREE SPECIFIC QUESTIONS

## Q1 — Steak & Honour: present in all three places, but our events are three months stale

🎯 **It is not missing, and it is not a spelling problem.**

| | Finding |
|---|---|
| **In their data?** | ✅ **Yes — trader `Steak & Honour`, 6 collections** |
| **In our `discovery_trucks`?** | ✅ **Yes — `Steak & Honour`**, `excluded=false`, `show_on_vf=true`, `show_on_hg=true`, aliases `["steak and honour","steak & honor"]` |
| **Does it have `discovery_events`?** | ⚠️ **Yes — but only 3, all dated 5–6 June 2026** |
| **In the 08–15 Sep window?** | 🔴 **0** |
| **Future events at all?** | 🔴 **0** |

Their six collections: 09 Sep *The Plough Shelford* · 10 Sep *Cambridge Wine Merchants* and *foodPark, Cambridge Science Park* · 11 Sep *The Boot Inn* and *foodPark CB1* · 12 Sep *Northstowe*.

🔎 Our three June rows carry `source = 'hatchesup_scraper'` — a one-off June import, never repeated. 🎯 **So Steak & Honour is a tracked, visible truck that has produced no event for three months.** It belongs in category (d) — a candidate **addition**, not a deletion.

*Failure mode if this proved nothing:* "not found" can mean an empty extraction, a spelling difference, or genuine absence. All three ruled out separately — the extraction returned 339 rows; I searched `name` **and** the `aliases` array **and** `%steak%`/`%honour%`/`%honor%` **and** the operator `trucks` table; and the truck was found in every one of our tables. **The absence is of events, and it is real.**

## Q2 + Q3 — 10 September, five trucks at two Saffron Walden pitches: their data settles it

🎯 **Every one of the five shows at THE COMMON. None shows at The Railway Arms.**

| Truck | We hold | They show |
|---|---|---|
| **Buffalo Joe's** | The Common **and** The Railway Arms, both 17:00–20:00 | 🎯 `Saffron Walden (The Common) - Off The Beaten Truck` 16:40–20:00 — **Common only** |
| **Guerrilla Kitchen** | The Common **and** The Railway Arms, both 17:00–20:00 | 🎯 `OFF THE BEATEN TRUCK - The Common` 17:00–20:00 — **Common only** (plus a separate lunchtime Science Park pitch) |
| **Nomadough** | The Common, The Railway Arms **and** a bare `Off The Beaten Truck`, all 17:00–20:00 | 🎯 `Off the beaten truck- on the common` 16:45–20:00 — **Common only** |
| **Tikka Tonic** | The Common **and** The Railway Arms, both 17:00–20:00 | 🎯 `THE COMMON` 17:00–20:00 — **Common only** |
| **Pizza Mondo** | The Common, The Railway Arms **and** Darwin Green | 🎯 `Off The Beaten Truck, The Common` 16:45–20:00 — **Common only** (Darwin Green and a lunchtime FoodPark are separate, and both are corroborated) |

### 🔴 The mechanism, found in our own `source` strings

🧪 **All eleven of those rows come from one scrape of one page:**

```
URL: https://www.offthebeatentruck.co.uk/saffron-walden | Strategy: scroll_lazy
```

That single page evidently lists **both** Saffron Walden pitches, and the extraction assigned **every truck on the page to both**. 🎯 **This is not five trucks double-booked; it is one page read twice over.** It explains the whole cluster and predicts more of the same wherever an operator publishes several pitches on one page.

⚠️ **A sixth truck, `The Noodle & Dumpling Bar` (`cf4c4314-…`), has a Railway Arms row from the same scrape — and is NOT in their data.** By the Tier-3 rule it gets no proposal, even though it is almost certainly the same artefact. **Consistency of evidence beats consistency of appearance.**

🧪 All six Railway Arms rows have `venue_id` set and `show_on_vf = true` — **they are live pins on the public map right now.**

---

# WHAT THE EVIDENCE WOULD LOOK LIKE IF IT WERE PROVING NOTHING

| Claim | Hollow signature | How ruled out |
|---|---|---|
| Their data is real | An empty extraction reports all 171 of our rows as unmatched | 339 collections, 75 traders, 134 locations; the HTML shell was rejected explicitly rather than parsed to zero |
| A truck is "absent" | Empty extraction / spelling difference / genuine absence all print "not found" | Each searched separately — see Q1, where all three were excluded before concluding |
| `bounds` drops rows | Two runs minutes apart could differ because the data changed | The 15 missing rows share one checkable property: `roughPosition: null`, 15 of 15 |
| Venue equality | A fuzzy matcher that says yes to everything | 3 matches reported as **uncertain** rather than forced; and 🔴 the automated substring test was **overruled by hand** where it favoured a vaguer name — see below |
| The Saffron Walden finding | Two sources disagreeing without a reason | The reason is in our own `source` column: one URL produced all eleven rows |
| No empty strategy | A truncated string read as a data finding | Re-read untruncated; swept all rows; **0** |

🔴 **One correction to my own working, made before proposing anything.** My automated venue test used substring containment, which preferred Nomadough's **bare** `Off The Beaten Truck` over the more specific `- The Common`, because their title `Off the beaten truck- on the common` contains the vaguer string. **A vaguer name is not a better match.** The list below is derived by reading each case, not from that test.

---

# PROPOSED DELETIONS — FOR YOUR APPROVAL. I HAVE DELETED NOTHING.

All six are **10 September**, all from the single `offthebeatentruck.co.uk/saffron-walden` scrape, all currently live pins, and in every case we hold a **second row for the same truck at the same time** which their data corroborates.

| # | Row id | Truck | Delete | Keep | One-line reason |
|---|---|---|---|---|---|
| **1** | `5f8f9d76-9ab3-41f2-bc23-a4df6cde8558` | Buffalo Joe's | `Off The Beaten Truck - The Railway Arms` | `e11e7bb2-…` The Common | They list only The Common; one van cannot be at both at 17:00. |
| **2** | `39996f73-8969-497c-9493-f1ebcc7f79f8` | Guerrilla Kitchen | `Off The Beaten Truck - The Railway Arms` | `40a15e97-…` The Common | Same; they list The Common plus a separate lunchtime pitch. |
| **3** | `6c891367-7d84-4323-95dc-13a4235b6ee2` | Nomadough | `Off The Beaten Truck - The Railway Arms` | `d23bc285-…` The Common | Same. |
| **4** | `4f5dd5d4-1359-4b71-b75c-228ae23367e1` | Tikka Tonic | `Off The Beaten Truck - The Railway Arms` | `d110d385-…` The Common | Same. |
| **5** | `7a0781f0-8f17-4c34-bc41-1f77e9114537` | Pizza Mondo | `Off The Beaten Truck - The Railway Arms` | `bf8f58ee-…` The Common | Same; their Darwin Green and FoodPark rows are separate and corroborated. |
| **6** | `fb30a4a8-65cd-4bd3-829b-d1ce1a2d0aab` | Nomadough | `Off The Beaten Truck` (bare name) | `d23bc285-…` The Common | A **third** row for the same truck, pitch and time; `venue_id` is NULL so it cannot even pin. |

**Deleting these six leaves every one of the five trucks with exactly one evening Saffron Walden pin, at the pitch Hatches Up names.**

## Deliberately NOT proposed

- 🔴 **`cf4c4314-…` The Noodle & Dumpling Bar @ The Railway Arms, 10 Sep** — same artefact, same scrape, **but the truck is not in their data, so they cannot contradict it.** Almost certainly wrong; no evidence to act on.
- **The 116 Tier-3 rows** — 34 trucks absent from Hatches Up entirely.
- **The 7 Zaket Potato rows (Tier 1)** — they show `10 Dereham Rd`, we show three other venues. A genuine contradiction, but Zaket Potato may run more than one van and their listing covers only pitches with their ordering. **Your call, not a safe automatic deletion.**
- **Pig-Casso's 11 Sep (3 rows) and Pizza Mondo 11 Sep (3 rows)** — their data lists several pitches that day and supports all of ours.
- **Pimp My Fish 11 Sep (2 rows)** — the confirmed deliberate two-van overlap.
- **Anything outside 08–15 September.**

---

# THE TREE

🧪 `HEAD = 801de1c`, `origin/main = 08ac368` — local is **ahead 1** with the previously-committed demo-layout change, still unpushed. **0 staged. Nothing committed, pushed, or added in this task.** The only file written is this report. **No database row was created, updated or deleted.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Whether their data is right and ours is wrong**, in any case where the two disagree. Both are scrapes. For the Saffron Walden cluster I have a mechanism in our own data that explains ours being wrong, which is the strongest form of evidence here — and it is still not proof.
- 🔴 **Whether Zaket Potato runs one van or two.** That decides seven Tier-1 rows and I could not settle it.
- 🔴 **Whether Buffalo Joe's genuinely trades 16:40–20:00 or 17:00–20:00.** Their +20 offset is consistent across three dates, which is either their ordering policy or our extraction rounding.
- ⚠️ **The −45 Elder Street Food disagreement on 11 Sep is unexplained** — ours says 16:00–19:00, theirs 16:45–20:00. One is wrong; nothing here says which.
- ⚠️ **Category (a) = 1 is an artefact of the time offset**, not a measure of agreement. Read (a) + (b) = 31.
- ⚠️ **The 3 "uncertain" venue matches** were left undecided rather than forced, so they appear in no category.
- ⚠️ **Their coverage is partial by construction** — Hatches Up lists trucks that use their ordering platform, at pitches that take orders through it. **Absence from their data is never evidence of absence in the world**, which is exactly why Tier 3 gets no proposals.
