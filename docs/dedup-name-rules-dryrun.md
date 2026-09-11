# Why the Debenham pair was missed, and two proposed rules — dry run only

**Nothing was written.** No code changed, no schema, no migration, no database write, the scraper was not
run, nothing was installed. Every figure below comes from one frozen snapshot taken at
**2026-09-11T10:48:05Z**, and every rule was executed as code against that snapshot rather than reasoned
about. `truck_events` was neither read nor written.

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 🔴 CORRECTIONS TO MY OWN EARLIER REPORTS — THE SIXTH IS MINE

1. **`docs/dedup-gate-build-report.md` describes the duplicate pairing as "same truck (resolved id when
   both rows have one, else the scraper-mirror normaliser on the name)". That is true of the gate and
   FALSE of the backfill**, which is the only thing that has ever compared two rows that were already in
   the table. The backfill groups by `discovery_truck_id || normalizeVenue(truck_name)` — **a UUID for
   linked rows and a name for unlinked ones, in the same key**. I wrote the sentence describing what I
   intended and did not check it against the script. That single line is the whole of Part A.
2. **`docs/dedup-rules-review-report.md` still says `foodPark` ↔ `FoodPark Biomedical` are 1.8 km apart.
   Re-measured: 512 m.** The build report carries the correction; the review was never updated.
3. **The table moved under me during this task.** It held 935 rows at snapshot time, not the 920 I
   measured an hour earlier and quoted in the previous two replies — 15 rows were created in the
   preceding three hours. Every number in this report is from the 935-row snapshot.
4. **The backfill's "103 rows would get a venue" is spent.** You ran it with `--apply`; the same step now
   finds **12**. 13 rows are marked superseded.

---

# PART A — WHY THE 500 m RULE DID NOT FIRE

## The answer in one line

**The two rows were never compared.** Neither candidate in the brief is the cause: both rows carry a
`venue_id`, R5 rejected nothing, and the two venues are not two rows with matching coordinates — **they
are the same venue row**. The rule never got the chance to look at them, because the only pass ever made
over already-stored rows put them in two different groups.

## The two rows

| | row 1 | row 2 |
|---|---|---|
| venue text | `Debenham Vets` | `Debenham` |
| start | 17:00 | 17:00 |
| `venue_id` | `b0898490…` | `b0898490…` — **the same venue** |
| `discovery_truck_id` | **NULL** | `aeddc37a…` |
| source | URL scraper | Drive Screenshot |
| created | 2026-08-27 | 2026-09-08 |

That venue row is `Debenham Vets` [Debenham], `52.2285, 1.1843`, postcode `IP14 6QT`, with coordinates and
a postcode. Asked directly, the shipped rule answers **duplicate, postcode, 0 m**:

```
gate.isDuplicate(venueA, venueB) → { rule: 'postcode', metres: 0, postcode: 'IP146QT' }
```

## The defect

`scripts/backfill-discovery-dedup.mjs`, step 2, builds its groups with:

```js
const k = e.event_date + '|' + (e.discovery_truck_id || normalizeVenue(e.truck_name))
```

One row has a truck id and one does not, so the two keys are:

```
2026-09-20|forgekitchen                              ← the URL-scraper row (no truck id)
2026-09-20|aeddc37a-3941-4267-bf42-cf19caa74cce      ← the Drive-Screenshot row (truck id)
```

**Two keys, two groups, never compared.** The expression mixes two identifier namespaces in one key, so
any truck whose rows are only partly linked splits into two groups. It is a defect in the rule's
plumbing, not a threshold problem and not a data gap — exactly the distinction the brief asked for.

**This is worth more attention than any threshold**, as the brief suspected. A threshold that is slightly
wrong mis-sorts edge cases. This silently removed whole pairs from consideration before any threshold was
consulted, and it did so precisely where the data is weakest: 82% of rows come from the writer that
resolves a truck id only 10% of the time, so partly-linked trucks are the normal case, not the exception.

**Blast radius, measured:** of the **197** same-date same-truck pairs in the future events, the backfill's
key splits **14** apart. One of those 14 is a duplicate under the existing rule — the Forge Kitchen pair.
The other 13 are not duplicates by any rule, so the bug cost exactly one missed mark today. It would cost
more as more rows arrive unlinked.

## The shipped gate does NOT have this defect

`lib/discovery-gate.ts` tests each pair individually and falls back correctly:

```ts
const sameTruck = (out.truck.id && ex.discovery_truck_id)
  ? out.truck.id === ex.discovery_truck_id
  : normalizeVenue(ex.truck_name) === myTruckKey
```

🧪 **Executed, dry run, nothing written:** re-posting the Drive Screenshot row through
`admitDiscoveryEvents` returns

```
truck     : alias-exact → aeddc37a…
venue     : Debenham Vets, "village agrees (matcher high)"
duplicate : supersedes ef5b6653… · rule postcode · 0 m · time gap 0 min
```

So why is the pair still unmarked? **Because the gate has never run on it.** The gate only judges a row as
it arrives, and both rows predate it. It is also not deployed: `lib/discovery-gate.ts` has **0 commits**
against it and is untracked in git, so nothing in production imports it. The backfill is the only pass
that has ever examined these two stored rows, and its group key split them.

**Fix the backfill's key, not the rule.** Replacing the group key with the gate's own pairwise test is a
one-expression change and would have marked this pair.

---

# PART B — THE TWO PROPOSED RULES, MEASURED

Universe: the **705 future events** in the snapshot, paired by same date + the gate's (correct) truck
test = **197 pairs**. 145 have both venues resolved; 52 do not and cannot be judged by any
distance-based rule.

## B1 · Identical coordinates

**Pair count first, as asked: 5 pairs in the future events have both venues at exactly the same latitude
and longitude. NONE of them is new — all 5 are already caught by the existing rule.**

| pair | already caught by |
|---|---|
| 2026-09-11 Nomadough `The Bull` ↔ `foodPark Biomedical Campus` | postcode |
| 2026-09-18 Pizzeria Gusto `Wickhambrook MSC` ↔ `MSC` | postcode |
| 2026-09-20 The Forge Kitchen `Debenham` ↔ `Debenham Vets` | postcode (the Part A pair) |
| 2026-09-17 Elder Street Food `Off The Beaten Truck - The Common` ↔ `The Common` | postcode |
| 2026-09-19 Nomadough `IVO Brewery` ↔ `Burleigh Hill Farm` | postcode |

3 of the 5 are one venue row used twice; 2 are distinct venue rows sharing coordinates.

**Verdict: B1 adds nothing today.** It is unambiguous and cheap, and it is a reasonable belt-and-braces
rule for the day a venue row has coordinates but no postcode — but it is not the fix for anything you
have now, and adopting it would not mark a single extra row. The reason all five are already caught is
that a shared postcode is the more common signal, and the 500 m test catches identical coordinates
anyway. **If you want one new rule rather than two, B1 is the one to drop.**

## B2 · Similar venue name at the same time

### What "similar" can mean, measured over all 197 pairs

Every definition below is built from the **existing** `normalizeVenue` in `lib/venue-signature.ts` (and
its existing 1-edit comparator `venuesFuzzyMatch`). No sixth normaliser was written; the token variants
apply the same normaliser to each word rather than to the whole string.

| definition | pairs accepted | catches all 3 musts? | catches any must-not? |
|---|---|---|---|
| **Containment either way, both ≥ 4 chars** | **22** | ✅ **yes** | ❌ none |
| Containment, no length guard | 59 | yes | ⚠️ **yes** — `The Street` |
| Levenshtein ≤ 1 (`venuesFuzzyMatch`) | **0** | ❌ catches none | no |
| Token subset | 24 | ❌ misses `Thelodgebar`/`The Lodge` | no |
| Token Jaccard ≥ 0.70 | 1 | ❌ misses two of three | no |
| Token Jaccard ≥ 0.50 | 19 | ❌ misses `Thelodgebar`/`The Lodge` | no |

**Only containment with a minimum length passes.** The three musts, measured:

| must catch | normalised | containment | distance | times |
|---|---|---|---|---|
| `Debenham` / `Debenham Vets` | `debenham` / `debenhamvet` | ✅ | 0 m | 17:00 = 17:00 |
| `Thelodgebar` / `The Lodge` | `thelodgebar` / `lodge` | ✅ | 737 m | 18:00 = 18:00 |
| `Dog show` / `Dog show (CXD)` | `dogshowcxd` / `dogshow` | ✅ | 1,111 m | 10:00 = 10:00 |

**The rejects — the half that proves the rule.** Every must-not is rejected, and by which test:

| must NOT catch | containment | same time | distance | rejected by |
|---|---|---|---|---|
| `Great Yeldham Village Centre` / `Ridgewell Village Centre` (×6 dates) | ❌ no | no (16:00 vs 18:20) | 3,211 m | all three |
| `Cambridge Science Park` / `foodPark` (×4 dates) | ❌ no | yes (12:00) | 6,675 m | name and ceiling |
| `The Bull Pub` / `Wintringham Plaza` (×17 dates) | ❌ no | mostly yes (07:00) | **no coordinates** | name, and the ceiling cannot be verified |
| `The Street` / `The Street - By Post Office` (×8 dates) | ❌ **only because of the length guard** | no (16:00 vs 20:05) | 2,581 m | all three |

🔴 **The length guard is load-bearing and it is not cosmetic.** `normalizeVenue` strips the filler words
`the` and `street`, so **`The Street` normalises to the empty string** — and every string contains the
empty string. Without a minimum length, containment accepts **59** pairs instead of 22 and merges `The
Street` with `The Street - By Post Office`, which are two real pitches 2,581 m apart. With a 4-character
floor it accepts 22.

⚠️ **What the guard costs, stated:** it rejects `Wickhambrook MSC` / `MSC`, which is a genuine duplicate
(`msc` is 3 characters). The existing postcode rule already marks that pair, so nothing is lost today.

### The distance ceiling

**Proposed: 1,500 m.** It is bounded on both sides by measured pairs, not chosen by feel:

| bound | value | from |
|---|---|---|
| must be **at least** | 1,111 m | `Dog show` / `Dog show (CXD)` — the widest pair you require caught |
| must be **below** | 2,581 m | `The Street` / `The Street - By Post Office` — two real pitches |

1,500 m clears the largest true positive by 35% and sits 42% below the smallest known false positive. The
choice is insensitive between those bounds: **every ceiling from 1,200 m to 2,500 m produces the same 7
pairs and the same 2 new marks.** A sweep:

| ceiling | pairs | new (not already caught) |
|---|---|---|
| 500 m | 2 | 0 |
| 750 m | 6 | 1 |
| **1,500 m** | **7** | **2** |
| 2,581 m | 8 | 2 |
| no ceiling | 8 | 2 |

⚠️ A ceiling is required for a second reason the data shows directly: the pair `foodPark Biomedical
Campus` ↔ `FoodPark Biomedical` passes containment and is **20,592 m** apart — a Cambridge name attached
to a Langley pitch. Only the ceiling stops that one.

⚠️ **The 2,553 m Lingwood pair is a true duplicate that the ceiling excludes from B2.** It shares postcode
NR13 4AZ and the existing rule already marks it. That is the argument for keeping B2 narrow: the postcode
half of the existing rule is the right tool for a same-postcode pair with a bad coordinate.

### The 7 pairs B2 accepts at 1,500 m

| distance | pair | status |
|---|---|---|
| 0 m | 2026-09-20 The Forge Kitchen `Debenham` ↔ `Debenham Vets` | existing rule already says duplicate |
| 0 m | 2026-09-17 Elder Street Food `Off The Beaten Truck - The Common` ↔ `The Common` | already marked |
| 512 m | 2026-09-11 Pig-Casso's `foodPark` ↔ `FoodPark Biomedical` | already marked |
| 512 m | 2026-11-13 Pig-Casso's, same pair | already marked |
| 512 m | 2026-10-09 Pig-Casso's, same pair | already marked |
| **737 m** | **2026-09-26 Pigs In `Thelodgebar` ↔ `The Lodge`** | 🔴 **new** |
| **1,111 m** | **2026-09-13 Marky D's `Dog show (CXD)` ↔ `Dog show`** | 🔴 **new** |

### Missing start times

**B2 should not fire when either row has no start time.** It cannot: "same time" is unverifiable, and the
pair falls through to the postcode, 500 m and identical-coordinate tests, which do not need a time.

The measured impact of that choice today is **zero**: of the 22 containment pairs, **0** are missing a
time. Of all 197 pairs, **7** have a missing time on one side. Across the future events, **85 of 705
(12.1%)** carry no usable start time, so this will bite later even though it does not now.

I considered treating two missing times as "equal" and rejected it: a row with no time is usually a row
the extractor could not read, so two blanks are two unknowns, not an agreement. Widening the rule at its
weakest evidence is the wrong direction.

### 13 pairs B2 cannot judge

13 of the 22 containment pairs have no distance at all. **12 of the 13 are because one side's event has
no `venue_id`** and 11 of those are `foodPark` rows; the 13th is `Haircut 5pm` / `Haircut`, whose venue
exists with no coordinates. B2 rejects all 13, because an unverifiable distance must not be treated as a
small one. That is the single biggest limit on every rule here, and it is a venue-matching problem — see
the last section.

## B3 · Everything together

Existing rules + B1 + B2 at 1,500 m, over the 705 future events, newest-wins, one loser per row:

| | rows |
|---|---|
| would be marked in total | **16** |
| already marked in the database | 13 |
| 🔴 **new rows this would add** | **3** |

Which rule fires, for all 16:

| rule | rows |
|---|---|
| existing — same postcode | 8 |
| existing — within 500 m | 6 |
| **B2 — name + same time + ≤1,500 m** | **2** |
| **B1 — identical coordinates** | **0** |

**The three new marks, named:**

| rule | loser ← winner |
|---|---|
| existing (postcode, 0 m) | 2026-09-20 The Forge Kitchen: `Debenham Vets` ← `Debenham` — **unblocked by fixing the group key, not by a new rule** |
| B2 (737 m) | 2026-09-26 Pigs In: `The Lodge` ← `Thelodgebar` |
| B2 (1,111 m) | 2026-09-13 Marky D's: `Dog show` ← `Dog show (CXD)` |

52 pairs remain unjudgeable because a venue is unresolved.

**Nothing was marked. Nothing was written. This is where I stopped.**

---

# WOULD TIGHTER VENUE MATCHING BE THE BETTER FIX?

**Yes — for the general problem, and the data says so clearly. But not for your three examples, and it
would not have caught the Debenham pair at all.**

## What the three examples actually are

They are not one thing:

| pair | venue rows behind it | what it really is |
|---|---|---|
| `Debenham` / `Debenham Vets` | **one** row, `Debenham Vets` | not a venue-matching failure at all — the matcher already collapsed them. Purely the Part A bug. |
| `Thelodgebar` / `The Lodge` | two rows, 737 m apart, one with no village and no postcode | a real venue duplicate |
| `Dog show` / `Dog show (CXD)` | two rows, 1,111 m apart | **not a venue** — a diary entry stored as one |

**Only the middle one is the case you describe.** So tighter venue matching would fix one of your three,
and the other two need the grouping fix and something else entirely.

## What tighter venue matching would collapse, measured

Across all 819 venues (728 with coordinates, 91 without, 589 with a postcode):

| signal | venue pairs | of which both rows carry events |
|---|---|---|
| identical coordinates | **116** | small — see the warning below |
| same full postcode, more than one venue | **56 postcodes, 125 venue rows** | includes `CB10 1JH` ×3, `NR13 4AZ` ×3, `CB2 1TN` ×3 |
| ≤ 250 m + name containment | 5 | 1 |
| ≤ 500 m + name containment | 11 | 2 |
| ≤ 750 m + name containment | 21 | 7 |
| ≤ 1,500 m + name containment | 32 | 8 |

A ≤750 m containment merge would collapse `Thelodgebar` into `The Lodge`, and then the **existing**
event rule marks that pair at 0 m with no new event rule at all. It would also collapse
`Off The Beaten Truck - The Common` / `The Common`, `Wintringham Plaza` / `Wintringham`,
`The Fox Inn` / `Fox Inn Honnington Drag Event`, and `Wylde Sky Brewery` / `Wylde Sky Taproom`.

🔴 **But do not merge venues on coordinates alone.** Of the 116 identical-coordinate venue pairs, the
great majority are not venues: `Latitude Festival`, `Private Event`, `Your Mums House`, `dr appointment`,
`Poss leave`, `Gas delivery ordered 22ndApril` — diary lines that were created as venues and geocoded to a
town centroid, so dozens of them share one point. Six venues sit on `NR1 1AA` alone. A coordinate-only
merge would fuse a doctor's appointment with a caravan club. **Name containment plus a radius is safe;
coordinates alone are not.** This is the mirror image of B1: identical coordinates is a sound signal for
two events of the same truck on the same day, and an unsound one for two venue records.

## The real blocker is upstream of both

**238 of the 705 future events have no `venue_id`.** That is why 52 pairs cannot be judged and why 12 of
the 13 unjudgeable containment pairs are unjudgeable. Eleven of those are `foodPark` rows, and there are
**10 `foodPark` venue rows** — `foodPark`, `FoodPark CB1`, `FoodPark Biomedical`, `foodPark Biomedical
Campus`, `FoodPark Genome Campus`, `FoodPark at Eddington`, `foodPark Cambridge North`, `foodPark West
Cambridge`, `FoodPark Science Park`, and one 100-character name. Some of those are genuinely different
pitches; the events cannot be attached to any of them.

## My recommendation

1. **Fix the backfill's group key first.** It is one expression, it needs no new rule, no threshold and no
   judgement, and it is the entire reason your example went unmarked.
2. **Then fix venue resolution, not the event rules.** Getting `venue_id` onto the 238 unresolved future
   rows would make 52 currently-unjudgeable pairs judgeable by rules you already have. That is a larger
   return than any third or fourth event rule, and it also fixes the map.
3. **Adopt B2 at 1,500 m if you want the two remaining marks now** — it is measured, it catches your three
   examples and rejects all four counter-examples. But it is a compensator for weak venue data, and if
   step 2 succeeds most of its work disappears.
4. **Skip B1.** It marks nothing today and the same signal is already covered.

---

# HOW I CHECKED

One snapshot (935 events, 819 venues, 231 trucks) was frozen and every figure derived from it, so no two
numbers here come from different moments. The rules were **executed**, not described: `isDuplicate`,
`r5Accept`, `normalizeVenue` and `venuesFuzzyMatch` were loaded from the shipped source by compiling it
with the repository's own TypeScript, the same technique the backfill uses, and `admitDiscoveryEvents`
was run in dry-run mode for the Part A proof. Distances are haversine on the venues' own stored
coordinates. The row count was 935 before and after every step.

**Not done:** no mark, no write, no migration, no schema change, no code change, no install, no scrape,
and `truck_events` was not touched.
