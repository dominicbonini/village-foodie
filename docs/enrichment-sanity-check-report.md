# Placeholder postcodes (SQL to run) and an acceptance gate on the venue matcher (dry run)

**Nothing was written, resolved, deleted or migrated.** The SQL below is for you to run; I did not execute
it. `truck_events` was neither read nor written. The scraper was not run. Marky D's `Haircut` / `Physio`
rows appear in listings because they are in the data; nothing is proposed for them.

Nothing in the brief arrived garbled and no instruction contradicted another.

Every figure was re-derived today from a fresh pull (`discovery_events 0-919/920`, `venues 0-818/819`),
the **shipped** `findVenue` compiled from `lib/venue-matcher.ts`, and the scraper's own `normalizeName`
extracted from `scripts/run-scraper.js`. The village anchor used in rules R2–R5 is re-derived the way the
matcher builds it (median of the coordinates of the other venues in that village) because that helper is
module-private; it is a re-derivation of the matcher's construction, not a new normaliser.

---

## 🔴 WHERE MY EARLIER REPORTS WERE WRONG

1. **"Perky Beans × 17 resolves to a venue 40 km away."** Measured: **36.3 km** from the Great Paxton
   anchor. Wrong direction of error but wrong nonetheless; the conclusion stands.
2. **I called NR1 1AA, CB2 1TN and NR13 3AA "placeholder postcodes".** Under the criterion you set —
   a value repeated across venues in *different* villages — **only NR1 1AA qualifies.** CB2 1TN and
   NR13 3AA are each one village's junk rows sharing one postcode; they are venue-hygiene problems, not
   placeholder postcodes, and nulling them would not be justified by the rule you asked for.
3. **"54 of 115 shared-postcode pairs are > 500 m apart" — re-derived, still 54 of 115 (116 pairs, 1
   without coordinates).** And "71 of 75, 36 low" — re-derived, still 71 of 75, 35 high / 36 low.
4. The Pig-Casso's `foodPark [CB1]` rows still resolve to the CB2 0AA row (2,212 m from `FoodPark CB1`)
   — unchanged from the last report; every candidate rule below rejects that resolution, which is the
   right outcome given the matcher cannot be changed.

---

# PART ONE — PLAIN ENGLISH

## (1) Placeholder postcodes

**How I found them.** Every full postcode in `venues` was grouped (case and spaces normalised — every
value is stored with the space, e.g. `NR1 1AA`, and no postcode has two spellings). 520 distinct postcodes
sit on 599 venues; 60 are shared by two or more rows. Two signals were tested on those 60:

- **Signal A — the brief's criterion:** the same postcode on rows whose *named villages differ*
  (village strings normalised; "Unknown", blank and "null" do not count as a village). **7 postcodes.**
- **Signal B — geographic spread:** rows under one postcode more than 1 km apart. **19 postcodes.**
  A real UK full postcode covers about fifteen addresses, so a kilometre of spread means at least one
  row's coordinate or postcode is wrong — but it does not say which, and it does not say the postcode is
  a placeholder. 14 of the 19 are single-village and are **not** proposed for nulling.

Then a third, read-only check: each of the 7 was looked up on postcodes.io and every row's distance to
the postcode's true centroid measured. That check changed the picture:

| postcode | rows | villages | what it actually is |
|---|---|---|---|
| **NR1 1AA** | 8 | Norfolk / Norwich | **A true placeholder.** Norwich city centre stamped on `Dog show`, `Poss leave`, `Lord Nelson`, `Armour fest`, `Busy`, `Gas delivery` ×2, `Marky D's` — a truck's diary, not venues. Six rows sit exactly *on* the centroid, which is what a fabricated coordinate looks like. |
| **PE19 0AW** | 5 | St Neots / Wintringham | **One real row** (Wintringham Primary Academy, 0 m) and **four wrong ones** 1.1–3.9 km away. |
| **CB11 4SB** | 3 | Langley / Lower Green / Saffron Walden | **Two real** (`The Bull`, and the mis-filed `foodPark Biomedical Campus`, both at the centroid) and `The Bull Pub [Saffron Walden]` 1.06 km off. |
| **NR29 5NY** | 3 | Ludham / Great Yarmouth | All three *at* the centroid — `dr appointment [Great Yarmouth]` is a diary row given Ludham's postcode. Placeholder by village, correct by geography. |
| **CB22 3AD** | 2 | Cambridge / Great Shelford | The Green Barn Farm Shop at the centroid; The GOG Farm Shop 1.06 km off. **One correct, one wrong.** |
| **CO9 4PT** | 2 | Ridgewell / Great Yeldham | Ridgewell Village Hall at the centroid; Great Yeldham Village Centre 1.4 km off. **One correct, one wrong.** |
| **PE28 4XA** | 2 | Alconbury / Alconbury Weald | Alconbury Weald at the centroid; Co-op 2.1 km off. **One correct, one wrong.** |

**So there is one true placeholder (NR1 1AA), one diary postcode (NR29 5NY), and five cases where the
postcode is right on one row and wrong on the other.** You asked for one statement per placeholder, and
that is given below — but for the five mixed cases a blanket null throws away a correct postcode, so a
row-scoped alternative is given too. Pick one.

**What nulling does to the pair count** (the number you asked for first):

| | pairs sharing a postcode | measurable | > 500 m |
|---|---|---|---|
| today | **116** | 115 | **54** |
| blanket — all 7 postcodes nulled (28 rows) | **69** | 68 | 30 |
| row-scoped — only the 10 rows far from their postcode's centroid | **88** | 87 | 30 |

Both variants remove the same 24 > 500 m pairs; the blanket one also removes 19 pairs that were genuinely
under 500 m (mostly the NR1 1AA diary rows against each other — harmless either way).

⚠️ **And one thing to know before you run either: nulling these changes no duplicate mark today.** The
only same-day pair that a placeholder postcode currently fuses (Nomadough, `The Bull` / `foodPark
Biomedical Campus`, CB11 4SB) is also 0 m apart, so the distance rule catches it regardless. The SQL is
insurance against the *next* diary entry, not a correction to any current mark.

## (2) The acceptance gate — what I propose and what the numbers say

**The shape.** The matcher runs exactly as it does today and returns a venue and a confidence. The gate
then asks one more question of that *output*, and if the answer is no, `venue_id` stays NULL. It never
picks a different venue. Five candidate rules were run over the 71 resolutions:

| rule | accepts | rejects | what it is |
|---|---|---|---|
| **R1** | 35 | 36 | the matcher's own `high` only — village agrees |
| **R2** | 39 | 32 | R1, **or** the venue is within 15 km of the event's village anchor |
| **R3** | 38 | 33 | R1, or within **5 km** |
| **R4** | 35 | 36 | R2, **and** if the event text carries a postcode it must equal the venue's |
| **R5** | 38 | 33 | R2, and if the event carries a postcode its **sector** must match (`CB1 2` = `CB1 2`) |

**All five reject the rows that matter:** Perky Beans × 17 (36.3 km), Wine-Boutique → Sudbury (42.7 km),
The Railway Tavern → Dereham (24 km), Dog Day Fairhaven (41 km), and every `foodPark [CB1]` row (no anchor
for a village called "CB1", so it cannot be checked — left NULL, as you asked). None of them rejects a
row that is plainly right.

**Where they differ, named:**

- **R1 alone** also rejects four that are almost certainly *right*: `The Bull [Langley]` → `[Lower Green]`
  (0.2 km from Langley — Langley Lower Green is one place), `Off The Beaten Truck - Wintringham` (4.6 km,
  the St Neots row), `Kings Forest Car Park [West Stow]` (3.5 km), and `Thelodgebar` (14.6 km). It is the
  safest rule and it costs the fewest genuine links; it leaves 45 pairs unjudgeable.
- **R2 (15 km)** recovers those four. 15 km is the ceiling the matcher already uses for its own distance
  check, so it is not a new number. It accepts `Thelodgebar` at 14.6 km, which is the one I would look at
  twice.
- **R3 (5 km)** is R2 minus `Thelodgebar`. Otherwise identical.
- **R4 (full postcode)** is a trap: it catches the two genuinely wrong resolutions that carry a postcode
  (Wine-Boutique, IP11 7BL vs CO10 2AG; and **Pizza Mondo's `foodPark`, whose scraped text says CB1 2GB
  while the matcher chose the CB2 0AA row — the matcher is wrong there and only the postcode reveals it**)
  — but it also rejects four **correct** ones on adjacent units: FoodPark CB1 (CB1 2GB vs CB1 2GA), The
  Boot (CB8 9UW vs CB8 9XA), and two Biomedical rows (CB2 0AA vs CB2 0BB). Full-postcode equality is too
  fine for scraped text.
- **R5 (postcode sector)** keeps R4's two catches and drops its four false rejections. It is R2 plus one
  cheap, high-value check, and it is the one I would choose.

**What the duplicate rule then finds** (same date + same truck, ≤ 500 m *or* same full postcode; the "12"
you asked me to compare against was the ≤ 500 m-only figure, so both are given):

| resolutions accepted | ≤ 500 m only | ≤ 500 m or same postcode | unjudgeable |
|---|---|---|---|
| none — today | 6 | 10 | 77 |
| all 71 (last report) | **12** | 16 | 3 |
| R1 | 9 | 13 | 45 |
| R2 | 11 | 15 | 36 |
| R3 | 11 | 15 | 38 |
| R4 | 10 | 14 | 44 |
| **R5** | **11** | **15** | 39 |

Versus accepting all 71, every rule loses exactly the pairs built on rejected resolutions — R2/R3/R5 lose
one (Forge Kitchen `Wine-boutique, Felixstowe` / `Wine-Boutique`, a 0 m pair that was only 0 m because
*both* rows had been wrongly sent to a Sudbury venue), R1 loses that plus the two Nomadough Langley pairs.
Nothing is gained by any rule, which is the correct shape: a gate can only remove, and it removes the
pairs that were artefacts of bad links. **Nulling the placeholder postcodes changes none of these counts.**

---

# PART TWO — THE SQL (for you; not executed, not in a migration)

**Option A — one statement per placeholder, as asked (28 rows across 7 postcodes):**

```sql
update public.venues set postcode = null where public.venues.postcode = 'NR1 1AA';
```
8 rows · Norfolk / Norwich · the diary placeholder

```sql
update public.venues set postcode = null where public.venues.postcode = 'PE19 0AW';
```
5 rows · St Neots / Wintringham · ⚠ nulls Wintringham Primary Academy's correct postcode too

```sql
update public.venues set postcode = null where public.venues.postcode = 'CB11 4SB';
```
3 rows · Langley / Lower Green / Saffron Walden · ⚠ nulls `The Bull`'s correct postcode too

```sql
update public.venues set postcode = null where public.venues.postcode = 'NR29 5NY';
```
3 rows · Ludham / Great Yarmouth · all at the centroid; only the diary row is wrong

```sql
update public.venues set postcode = null where public.venues.postcode = 'CB22 3AD';
```
2 rows · Cambridge / Great Shelford · ⚠ one of the two is correct

```sql
update public.venues set postcode = null where public.venues.postcode = 'CO9 4PT';
```
2 rows · Ridgewell / Great Yeldham · ⚠ one of the two is correct

```sql
update public.venues set postcode = null where public.venues.postcode = 'PE28 4XA';
```
2 rows · Alconbury / Alconbury Weald · ⚠ one of the two is correct

**Option B — row-scoped: null only the 10 rows more than 500 m from their postcode's real centroid.**
NR1 1AA's six on-centroid diary rows and NR29 5NY's three are *not* touched by this option; if you want
the diary rows' postcodes gone you need Option A for those two.

```sql
update public.venues set postcode = null where public.venues.id = 'b5f04783-8797-4a6a-9fad-c6a4469254da';
```
Gas delivery [Norfolk] · 767 m from NR1 1AA

```sql
update public.venues set postcode = null where public.venues.id = 'ef4971a2-5604-44b8-a943-67d2378b727d';
```
Busy [Norwich] · 666 m from NR1 1AA

```sql
update public.venues set postcode = null where public.venues.id = '12eaee47-b8e7-49a9-93f3-bb08f840115d';
```
Off The Beaten Truck, Wintringham [St Neots] · 3,892 m from PE19 0AW

```sql
update public.venues set postcode = null where public.venues.id = '5b09c044-7737-40bd-b67b-210e7fdc7cd4';
```
Off The Beaten Truck - Wintringham [St Neots] · 1,147 m from PE19 0AW

```sql
update public.venues set postcode = null where public.venues.id = 'a485dd51-f7e1-4e94-bd40-08dec7bee894';
```
Wintringham Plaza [Wintringham] · 1,147 m from PE19 0AW

```sql
update public.venues set postcode = null where public.venues.id = 'a6d7e179-23e9-4a31-82f8-ed81544e6deb';
```
Wintringham [St Neots] · 1,147 m from PE19 0AW

```sql
update public.venues set postcode = null where public.venues.id = 'a0f16e12-16f7-41a5-a9af-b37dee7b5f9f';
```
The Bull Pub [Saffron Walden] · 1,059 m from CB11 4SB

```sql
update public.venues set postcode = null where public.venues.id = '449b7705-5006-4aa6-a354-3e5c3a7bcf8f';
```
The GOG Farm Shop [Great Shelford] · 1,057 m from CB22 3AD

```sql
update public.venues set postcode = null where public.venues.id = '3d955264-9d4d-4154-a617-f8b9004f083f';
```
Great Yeldham Village Centre [Great Yeldham] · 1,382 m from CO9 4PT

```sql
update public.venues set postcode = null where public.venues.id = '9c600bae-dc26-4dec-9e61-da13b9c0bb9d';
```
Co-op [Alconbury Weald] · 2,110 m from PE28 4XA

⚠️ Option B assumes the *coordinate* is right and the postcode wrong. For the four Wintringham rows that
could be reversed (the coordinate 1.1 km out, the postcode right); nulling the postcode is still the safe
direction for the duplicate rule, because a null can only ever *fail to match*.

**The 14 spread-only postcodes are deliberately not in either option.** They are single-village rows > 1 km
apart under one postcode — CB2 8AA (Playbox / Kwela Kwela / Mezzoforte), CB8 8TG (the two Affleck Arms
rows 2.9 km apart), NR13 4AZ (three Lingwood rows, 2.5 km), CB24 1AA (Northstowe, 4.3 km), CB23 6DW
(Cambourne, 4.6 km) and nine more. They are bad coordinates, and they matter to the *distance* half of the
rule, not the postcode half. They are listed in the run output for a separate pass.

---

# PART THREE — THE ACCEPTANCE GATE IN DETAIL

**Position.** After `findVenue` returns `{ venue, confidence }` and before `venue_id` is written. The
matcher is untouched; no normaliser is added. On a failed check the event is inserted with `venue_id`
NULL and the failure reason kept alongside it (in C2's superseded/meta column family, or a log) so the
gap is visible.

**R5, stated as a rule:**
1. If the matcher said `high` (village agrees) → accept.
2. Else compute the event's village anchor (median of the other venues in that village, as the matcher
   does). No anchor (no other venue in that village, or no village) → **reject**.
3. Distance from anchor to the candidate venue > 15 km → **reject**.
4. If the scraped text (`venue_name`, `village`, `ai_notes`) contains a UK postcode and the venue has one,
   and their **sectors** differ (outward code + first inward digit) → **reject**.
5. Otherwise accept.

**Every resolution R5 rejects, with the reason** (33 rows):

| rows | event → matcher's choice | reason |
|---|---|---|
| 17 | The Bull Pub [Great Paxton] → [Saffron Walden] | 36.3 km from Great Paxton anchor (n=3) |
| 6 | foodPark [CB1] → foodPark [Cambridge] CB2 0AA | no anchor for a village named "CB1" |
| 4 | Blackpit Brewery [Stow-Bridgwater] → [Stowbridge] | no anchor (village spelt uniquely) — ⚠ probably right; left NULL |
| 1 | Wine-Boutique [Felixstowe] → [Sudbury] | 42.7 km; and sector IP11 7 ≠ CO10 2 |
| 1 | foodPark [Cambridge] (Pizza Mondo) → foodPark CB2 0AA | village agrees, **but** scraped CB1 2GB ≠ sector CB2 0 — the matcher's choice is wrong |
| 1 | The Railway Tavern [Norwich] → [Dereham] | 24.0 km |
| 1 | Dog Day Fairhaven [Unknown] → [Unknown] | 41.1 km from the "Unknown" anchor |
| 1 | Newton Flotman Quiz Night [—] → [Unknown] | no village on the event |
| 1 | The Affleck Arms [—] → [Dalham] | no village on the event — ⚠ probably right; left NULL |

**Every resolution R5 accepts that R1 would not** (3 rows): `The Bull [Langley]` → Lower Green (0.2 km),
`Off The Beaten Truck - Wintringham` → St Neots (4.6 km), `Kings Forest Car Park [West Stow]` → Bury St
Edmunds (3.5 km). R2 additionally accepts `Thelodgebar` at 14.6 km; R5 does too.

**What the gate cannot do.** It cannot rescue a row whose village is a postcode fragment (`CB1`), a
unique spelling (`Stow-Bridgwater`), or absent — those stay NULL, which is the outcome you asked for. And
it cannot detect a wrong venue row that *agrees* on village: `foodPark Biomedical Campus` filed under
Langley is accepted by every rule because the event also says Langley. That row needs fixing in `venues`;
no acceptance rule can see it.

---

# HOW I CHECKED

**Executed:** the postcode census and both signals over all 819 venues; postcodes.io centroid lookups for
the 7 flagged postcodes (read-only, external) and per-row distances; the pair counts under three states;
`findVenue` over the 75 unlinked rows; the five rules with named accepts and rejects; the duplicate rule
under two definitions × two postcode states × seven acceptance sets.

**Reasoned:** which mixed-postcode row is the correct one (the on-centroid row, on the assumption the
coordinate is right); that R5 is the better choice; that "probably right" rows left NULL (Blackpit, Affleck
Arms) are an acceptable cost.

**Not done:** no SQL executed, no resolution applied, no row marked. The 14 spread-only postcodes were
measured and listed but are out of this task's scope.
