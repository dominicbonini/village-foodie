# The backfill grouping fix, and the two added rules — dry run only

**Nothing was written.** No mark, no database write, no migration applied, no scrape, nothing installed.
Code changed in three files and one migration was written and left unapplied. Every number comes from one
frozen snapshot taken at **2026-09-11T10:59:46Z**: **935 events** (705 future, 230 past), **819 venues**,
231 trucks, **13 rows marked superseded** — 7 `postcode` and 6 `distance`, counted from the table, not
from the previous report. `truck_events` was neither read nor written.

Nothing in the brief arrived garbled. One statement in it does not hold, and it is flagged in §2a rather
than quietly implemented around.

---

# 1 · THE GROUPING KEY

## What it was, and what it is now

```js
// BEFORE — one key per ROW, mixing two identifier namespaces
const k = e.event_date + '|' + (e.discovery_truck_id || normalizeVenue(e.truck_name))

// AFTER — the bucket is the DATE ALONE, and the truck test is made PER PAIR
const k = e.event_date
const sameTruck = (a, b) => (a.discovery_truck_id && b.discovery_truck_id)
  ? a.discovery_truck_id === b.discovery_truck_id
  : normalizeVenue(a.truck_name) === normalizeVenue(b.truck_name)
```

## Why that groups correctly whether or not a row is linked

The old key had to **choose a namespace for each row before any comparison happened**. A linked row chose
its UUID, an unlinked row chose its name, and two rows that chose differently could never meet — even
when they were plainly the same truck. The Forge Kitchen pair produced
`2026-09-20|aeddc37a-3941-4267-bf42-cf19caa74cce` and `2026-09-20|forgekitchen`, so no rule ever ran on
it.

Deciding **per pair** removes that choice:

- **Both rows linked** → compare ids. Ids are authoritative, so two genuinely different trucks can never
  merge no matter how alike their names are.
- **Either row unlinked** → there is no id to compare, so fall back to the normalised name, which every
  row has. The fallback is **exact equality** on the normalised string, not containment, so it cannot
  drag a different truck in.

This is byte-identical in behaviour to the test the shipped gate already makes, which is the point: the
backfill and the live path now judge "same truck" by the same rule.

## 🔴 The proof that it still keeps trucks apart

A date-only bucket that forgot the truck test would also "find" the Debenham pair, so the separation is
proved directly:

| | rows marked |
|---|---|
| 🔴 strawman — one bucket per date, **no truck test at all** | **24** |
| ✅ with the per-pair truck test | **16** |
| rows a bucket-only key would wrongly merge | **8** |

Of the **4,891** same-date pairs in the future events, **197** pass the truck test and **4,694** are
rejected before a venue is even looked at.

**Trucks it correctly refuses to group, by name** — each of these would have been marked a duplicate
without the test:

| date | kept apart | why it matters |
|---|---|---|
| 2026-09-11 | **Pizza Mondo** vs **Steak & Honour**, both at `FoodPark CB1` | a food-park line-up: several trucks at one pitch on one day, same postcode |
| 2026-09-11 | **Pimp My FIsh** vs **Steak & Honour**, both at `FoodPark CB1` | same |
| 2026-09-11 | **Pig-Casso's** vs **Nomadough** at the Biomedical Campus | two trucks, one site, 26 m apart |
| 2026-09-12 | **Between Buns** vs **Between Buns Royston**, both at `11 Kneesworth St` | **the hard case**: near-identical names, same address, same day. One row is linked and one is not, so the test falls back to the name — and `betweenbun` ≠ `betweenbunroyston`, so `sameTruck = false`. |

**Control, the pair the old key split:** `Debenham` (truck id set) vs `Debenham Vets` (truck id NULL) →
`sameTruck = true`.

⚠️ **Stated cost of the name fallback:** it is exact equality, so if one truck really is recorded under
two spellings and neither row is linked, the pair is missed. That is the conservative direction, and
`Between Buns` / `Between Buns Royston` is the live example either way — if those are one truck, this
fix does not join them.

## 🔴 Were the 13 marks you applied affected?

**No. Not one of the 13 was wrong because of the key.** I ran four passes over the same snapshot and
diffed the results, so this is measured rather than argued:

| pass | marks |
|---|---|
| **A** — old key, old rules (**this is what produced your 13**) | 13 |
| **B** — key fixed, rules unchanged | 14 |
| **C** — key fixed, both new rules | 16 |
| **D** — C plus chain resolution (the script as it now stands) | 16 |

**A → B, the effect of the key fix alone:**

- rows it now finds that it missed: **1** — `2026-09-20 The Forge Kitchen: "Debenham Vets" ← "Debenham"`
- rows it would no longer mark: **0**
- marks whose winner or rule changes: **0**

Checked against the database directly: all **13** marked rows are re-derived by the fixed script, **0**
would be un-marked, and **3** new rows would be added. So the hole cost you exactly one missed pair and
no wrong ones.

## 🔴 But a second defect did affect 3 of the 13 — and it is not the key

**Three of the 13 rows point at a winner that is itself superseded.** All three are Pig-Casso's
`foodPark` rows, on 2026-09-11, 2026-10-09 and 2026-11-13. Each records
`superseded_by → "FoodPark Biomedical"`, and that row is itself superseded by
`"Biomedical Campus Cambridge"`. A loser pointing at a loser.

The cause is the pairwise loop, not the key: for a cluster of three or more duplicates it marks each row
against the newest row **it personally matched**, which may itself lose to a newer one. "Newest wins"
should mean the survivor of the cluster wins. The fixed script now walks each winner to the row that is
not itself a loser and records `chained_from` in the metadata.

⚠️ **Re-running the backfill will NOT correct those three rows.** The apply step is guarded with
`.is('superseded_by', null)`, which is what stops it from re-writing settled rows — so the three keep
their stale winner until they are corrected directly. The SQL to do that is in the chat and in §5. Their
`show_on_vf` / `show_on_hg` are already false, so nothing is visible that should not be; only the record
of which row won is wrong.

---

# 2 · THE TWO ADDED RULES

Both live in **`lib/discovery-gate.ts`** as one new exported function, `duplicateVerdict`, which the live
gate and the backfill both call. That is deliberate: the backfill's own header promises it uses the
shipped gate rather than a copy of its rules, and putting the new rules anywhere else would have broken
that promise the moment the two drifted.

Priority order: **postcode → distance ≤ 500 m → identical coordinates → name + time**.

## 2a · Identical coordinates — implemented as instructed, and it is unreachable

**🔴 The justification in the brief does not hold, so I am flagging it rather than implementing quietly
around it.** The brief says it "protects a venue that has coordinates but no postcode, where distance
alone may not fire". Distance *does* fire there. Identical coordinates means both venues have
coordinates; `isDuplicate` therefore measures a distance, that distance is 0 m, and 0 ≤ 500 returns
`distance` before the new branch is ever reached. It is not "subsumed today" — in this order it is
**unreachable by construction**, whatever the data does.

🧪 **Measured, not assumed: it fires on 0 of the 197 same-truck pairs.** The 5 pairs whose venues share
coordinates all return `postcode` or `distance` from the branch above.

I implemented it anyway, as you instructed, and it is free. It becomes live if `DUP_DISTANCE_M` is ever
tightened below the precision of a coordinate pair, or if the order is changed to put it first. If you
want it to actually record `identical-coords` for those 5 pairs, the single change is to move it above
the distance test — say the word and it is a two-line edit, but it would relabel pairs that currently
read `distance`.

## 2b · Similar name at the same start time

Containment either way on the **existing** `normalizeVenue` from `lib/venue-signature.ts` — no sixth
normaliser was written — with a **4-character floor**, **both start times known and equal**, and the two
venues **within 1,500 m**.

🔴 **The floor is load-bearing.** `normalizeVenue` strips the filler words `the` and `street`, so
`The Street` normalises to the **empty string**, and every string contains the empty string. Without the
floor, containment accepts 59 of the 197 pairs instead of 22 and merges two real pitches 2,581 m apart.
⚠️ It costs `MSC` (three characters), a genuine duplicate — which the postcode rule already catches.

🔴 **An unverifiable distance is not a small one.** If either venue lacks coordinates the rule does not
fire. Neither does it fire when either start time is missing: a blank is an unread field, not an
agreement.

## 2c · The migration — written, NOT applied

`superseded_reason` carries a CHECK constraint allowing only `'postcode'` and `'distance'`, so the two
new values need it widened:

**`supabase/migrations/20260912_superseded_reason_values.sql` — 2,669 bytes.** The full SQL is in the
chat. After running it: **`notify pgrst, 'reload schema';`** — it is the last line of the file. For a
constraint-only change PostgREST does not strictly need the reload, and I would rather say so than imply
a dependency that is not there; it is harmless and keeps the habit intact.

🔴 **Run it before the backfill is run with `--apply`.** Without it, the two `name-time` marks are
rejected with SQLSTATE 23514 and counted as mark failures while the postcode and distance marks still
land — a partial run, not a clean stop. The 13 existing rows carry `postcode` or `distance`, both still
allowed, so the new constraint validates against today's table without rewriting a row.

---

# 3 · THE DRY RUN — WHAT WOULD BE MARKED

`node scripts/backfill-discovery-dedup.mjs` (no flag, writes nothing, exit 0). **16 rows**: the 13
already applied, plus 3 new.

```
pairs on the same date 4891 → same truck 197 (4694 different trucks, never compared)
by rule: postcode 8 · distance 6 · name-time 2 · identical-coords 0
unjudgeable pairs (a venue unresolved): 51
```

## 🔴 THE 3 NEW ONES

| date | truck | loser venue (time) | winner venue (time) | distance | rule |
|---|---|---|---|---|---|
| 2026-09-20 | The Forge Kitchen | `Debenham Vets` (17:00) | `Debenham` (17:00) | 0 m, IP14 6QT | **postcode** — the pair the old key hid |
| 2026-09-13 | Marky D's | `Dog show` (10:00) | `Dog show (CXD)` (10:00) | 1,111 m | **name-time** |
| 2026-09-26 | Pigs In | `The Lodge` (18:00) | `Thelodgebar` (18:00) | 737 m | **name-time** |

Time gap is 0 minutes on all three.

## The 13 already applied, re-derived

| date | truck | loser (time) | winner (time) | distance | rule |
|---|---|---|---|---|---|
| 2026-09-11 | Nomadough | `foodPark Biomedical Campus` (17:00) | `Langley Lower Green` (17:00) | 210 m | distance |
| 2026-09-11 | Nomadough | `The Bull` (17:00) | `Langley Lower Green` (17:00) | 210 m | distance |
| 2026-09-11 | Nomadough | `FoodPark Biomedical` (12:00) | `foodPark at The Green & The Gardens…` (12:00) | 26 m | distance |
| 2026-09-11 | Pig-Casso's | `FoodPark Biomedical` (12:00) | `Biomedical Campus Cambridge` (12:00) | 26 m | distance |
| 2026-09-11 | Pig-Casso's | `foodPark` (12:00) | `Biomedical Campus Cambridge` (12:00) | 512 m, CB2 0AA | postcode ⚠️ **chain: recorded as `FoodPark Biomedical`** |
| 2026-09-17 | Elder Street Food | `Off The Beaten Truck - The Common` (17:15) | `The Common` (17:15) | 0 m, CB10 1JH | postcode |
| 2026-09-18 | Pizzeria Gusto | `Wickhambrook MSC` (—) | `MSC` (—) | 0 m, CB8 8YN | postcode |
| 2026-09-19 | Nomadough | `IVO Brewery` (17:00) | `Burleigh Hill Farm` (17:00) | 0 m, PE27 3LY | postcode |
| 2026-09-25 | Marky D's | `Lingwood Village Hall Karaoke` (17:30) | `Lingwood Village Hall` (17:30) | 2,553 m, NR13 4AZ | postcode |
| 2026-10-09 | Pig-Casso's | `FoodPark Biomedical` (12:00) | `Biomedical Campus Cambridge` (12:00) | 26 m | distance |
| 2026-10-09 | Pig-Casso's | `foodPark` (12:00) | `Biomedical Campus Cambridge` (12:00) | 512 m, CB2 0AA | postcode ⚠️ **chain** |
| 2026-11-13 | Pig-Casso's | `FoodPark Biomedical` (12:00) | `Biomedical Campus Cambridge` (12:00) | 26 m | distance |
| 2026-11-13 | Pig-Casso's | `foodPark` (12:00) | `Biomedical Campus Cambridge` (12:00) | 512 m, CB2 0AA | postcode ⚠️ **chain** |

Neither `Wickhambrook MSC` nor `MSC` carries a start time; they are marked on postcode, which needs none.

## 🔴 THE REJECTS — run through `duplicateVerdict`, by name

A rule that matched everything would catch your three examples too, so these are the proof:

| pair | occurrences | distance | verdict |
|---|---|---|---|
| `Great Yeldham Village Centre` / `Ridgewell Village Centre` | 6 dates | 3,211 m | **REJECTED** |
| `Cambridge Science Park` / `foodPark` (Pig-Casso's two vans, both 12:00) | 4 dates | 6,675 m | **REJECTED** |
| `The Bull Pub` / `Wintringham Plaza` (Perky Beans two vans) | 17 dates | no coordinates | **REJECTED** |
| `The Street` / `The Street - By Post Office` | 8 dates | 2,581 m | **REJECTED** |

Every occurrence of all four returns no verdict. `The Bull Pub` / `Wintringham Plaza` is rejected three
times over: the names do not contain each other, the distance cannot be verified, and on 7 of the 17
dates the times differ as well.

**Nothing was marked. Nothing was written. This is where I stopped.**

---

# 4 · WOULD TIGHTER VENUE MATCHING HAVE BEEN THE BETTER FIX?

**It is the better fix for the cause, it is not a substitute for the rule, and it would not have caught
the Debenham pair at all.** Measured, not argued.

## First, the premise

`Debenham` and `Debenham Vets` do not "share identical coordinates" as two venue rows. **There is one
venue row** — `Debenham Vets` [Debenham], IP14 6QT — and both events already point at it. Venue matching
worked perfectly there. The pair was invisible for one reason only: the grouping key. **No amount of
venue merging would have found it.**

Of your three examples, only one is a venue-matching failure:

| pair | venue rows behind it | what it is |
|---|---|---|
| `Debenham` / `Debenham Vets` | **1** | already merged; a pure grouping bug |
| `Thelodgebar` / `The Lodge` | 2, 737 m apart, one with no village and no postcode | a real venue duplicate |
| `Dog show` / `Dog show (CXD)` | 2, 1,111 m apart | **not a venue** — a diary entry stored as one |

## What a venue merge would collapse

Rule measured: **name contained either way (same 4-character floor) + within R**.

| R | venue pairs | venue rows involved | events attached |
|---|---|---|---|
| 250 m | 5 | 9 | 47 |
| 500 m | 11 | 18 | 58 |
| **750 m** | **21** | **31** | **94** |
| 1,000 m | 26 | 40 | 96 |
| 1,500 m | 32 | 51 | 99 |

At 750 m the 31 rows form **12 clusters**, so the table goes **819 → 800 venues**, a net reduction of 19.
**7 of the 21 pairs carry events on both sides**, which is where data actually moves — including
`foodPark`(8 events) with `FoodPark Biomedical`(4) and with `foodPark at The Green…`(5),
`Off The Beaten Truck - The Common`(5) with `The Common`(4), `Platform One Café`(2) with
`Platform One Café, Clare Castle…`(10), and `The Lodge`(10) with `Thelodgebar`(1).

## The decisive test — does it remove the need for the name rule?

| configuration | rows marked |
|---|---|
| old rules, venues as they are | 14 |
| **old rules, venues merged at 750 m** | **15** |
| **new rules, venues as they are** | **16** |

| the 2 `name-time` marks | under a venue merge instead |
|---|---|
| `Thelodgebar` / `The Lodge` (737 m) | ✅ **caught** — after merging, both events share a venue and `postcode` fires |
| `Dog show` / `Dog show (CXD)` (1,111 m) | ❌ **still missed** — beyond any sane venue radius |

So a venue merge replaces **one** of the two, and the other needs a 1,200 m venue-merge radius, which is
far too wide to apply to venues in general.

## What would break

- **5 of the 21 pairs have disagreeing villages**, the risky ones: `Kenton`[Kenton] / `Kenton Hall`
  [Stowmarket] at 588 m is the one I would not merge automatically — a village and a hall are often not
  the same pitch. It carries 0 events today. The other four are benign
  (`Wintringham Plaza`/`Wintringham`, `The Fox Inn`/`Fox Inn Honnington Drag Event`,
  `Clay Farm Community Gardens`/`Clay Farm Community Garden`, `The Lodge`/`Thelodgebar`).
- 🔴 **Never merge venues on coordinates alone.** There are **116** venue pairs at identical
  coordinates and only **4** carry events on both sides. The rest are diary lines stored as venues —
  `Latitude Festival`, `Private Event`, `Your Mums House`, `dr appointment`, `Poss leave` — geocoded to a
  town centroid, so dozens share one point. Six venues sit on `NR1 1AA` alone. This is the mirror image
  of §2a: identical coordinates is a sound signal for two events of one truck on one day and an unsound
  one for two venue records.
- **Postcode alone is no safer**: 56 postcodes are held by more than one venue, covering 125 rows.

## My answer

**Do both, in this order, and the third item is worth more than either.**

1. **The grouping fix** — done here. It is the only thing that addresses your actual example, it needs no
   threshold and no judgement.
2. **Venue merging at ≤750 m with name containment and a manual look at the 5 village-disagreement
   pairs.** It removes 19 duplicate venue rows, fixes the map as well as the dedup, and makes one of the
   two `name-time` marks unnecessary. It is a cause fix, and I would rather have it than a fourth rule.
3. 🔴 **But the bigger prize is upstream of both: 238 of the 705 future events have no `venue_id` at
   all** — 34% — and that is why **51 pairs remain unjudgeable** by any rule here. Resolving those would
   make more pairs decidable than any new rule will.

Keep `name-time` as well, for now: it is measured, it catches both of your remaining examples, it rejects
all four counter-examples, and it costs 2 marks. If step 2 and step 3 land, most of its work disappears
and it can be reconsidered then.

---

# 5 · FILES, AND HOW I CHECKED

| file | change |
|---|---|
| `lib/discovery-gate.ts` | added `DUP_NAME_CEILING_M`, `DUP_NAME_MIN_CHARS`, the `DupRule` type and `duplicateVerdict`; the gate's own duplicate check now calls it |
| `scripts/backfill-discovery-dedup.mjs` | the group key fix, the per-pair `sameTruck` test, `duplicateVerdict`, chain resolution, and a dry-run listing split into NEW vs already-applied |
| `supabase/migrations/20260912_superseded_reason_values.sql` | **new, 2,669 bytes, NOT applied** |

`npx tsc --noEmit` exits **0**. `eslint lib/discovery-gate.ts` reports **0 problems**;
`app/api/discovery/ingest/route.ts` **0**; `app/api/inbound-schedule/route.ts` **3**, the same three
pre-existing `no-explicit-any` errors it had before this task, on lines I did not touch.

The rules were **executed**, not described: `duplicateVerdict`, `isDuplicate` and `normalizeVenue` were
loaded from the shipped source by compiling it with the repository's own TypeScript, and every count
above came from running them over the snapshot. The four-pass isolation (A/B/C/D) is what separates the
key fix from the new rules from the chain fix, so no single number is doing two jobs.

**Verified unchanged after all of it:** 935 rows, 13 marked, 7 `postcode` / 6 `distance`, 238 future rows
without a venue.

**Not done:** no mark, no write, no migration applied, no schema change, no scrape, no install, and
`truck_events` was not touched.
