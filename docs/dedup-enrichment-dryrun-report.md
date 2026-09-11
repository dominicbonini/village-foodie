# C1 — enrichment dry run and the postcode measurement

**Dry run only.** Nothing was resolved, written, deleted or migrated. The scraper was not run.
`truck_events` was neither read nor written. The only file touched is this report.

Nothing in the brief arrived garbled and no instruction contradicted another.

Every number below was re-derived today from a fresh pull (`discovery_events 0-919/920`,
`venues 0-818/819`, `discovery_trucks 0-230/231`, all count-asserted), using the **shipped** matcher
(`findVenue` in `lib/venue-matcher.ts`, compiled from source) and the scraper's **own** `normalizeName`
(extracted from `scripts/run-scraper.js`). No matcher and no normaliser was written.

---

## 🔴 WHERE MY OWN REPORTS WERE WRONG

1. **`dedup-gate-plan-report.md` said two known duplicates were hiding in the unjudgeable set and would
   surface once linked: Nomadough's Biomedical pair and Pig-Casso's `foodPark` / `FoodPark CB1`.
   The second does NOT surface.** The existing matcher sends every Pig-Casso's `foodPark [CB1]` row to
   the **CB2 0AA** `foodPark`, 2,212 m from `FoodPark CB1`, so all six dates are judged *distinct*. Traced
   step by step in §1d — it is a real limitation of the matcher, not a rounding error, and it recurs on
   other rows. My expectation was stated as fact; it should have been stated as a guess.
2. Everything else load-bearing re-derives cleanly: **71 of 75** rows resolvable (35 high / 36 low);
   **77 of 181 pairs (42.5%)** unjudgeable; `foodPark` ↔ `FoodPark Biomedical` **512 m**, both
   **CB2 0AA**; name-based exclusion catches **24** linked-truck rows the FK misses, FK catches **0** the
   name misses; **10** foodPark venue rows; last 14 days **4–44 rows/day, mean 17.8**; **230** past-dated
   rows today. The placement claim still holds: the only `discovery_events` reference in
   `/api/inbound-schedule` is its own upsert, and the bridge loop is `for (const row of rows)`.

---

# PART ONE — PLAIN ENGLISH

## What the existing matcher would do with the 75 unlinked rows (a, b)

**71 of the 75 resolve; 4 do not.** But "resolves" hides the important half: **36 of the 71 resolve at
LOW confidence**, and low confidence here means one specific thing — *the venue's village does not agree
with the event's village*. Every one of the 71 matched on an **exact normalised name**; not one needed
fuzzy or partial matching. The question is never "is there a venue called this" — it is "is it the
right one".

The 35 high-confidence resolutions look sound: The Street [Capel St. Mary] ×16, Rougham Pumpkin Patch,
ITFC Portman Road, The Boot [Dullingham], IVO Brewery, and so on.

The 36 low-confidence ones split into three kinds:

- **Probably right, village spelt differently** — `The Bull [Langley]` → `The Bull [Lower Green]` (Langley
  Lower Green is one place), `Blackpit Brewery [Stow-Bridgwater]` → `[Stowbridge]`, `Off The Beaten Truck -
  Wintringham` → the St Neots row.
- **Probably wrong, and the matcher cannot know** — **Perky Beans × 17 rows**, `The Bull Pub [Great
  Paxton]` → `The Bull Pub [Saffron Walden] CB11 4SB`. Great Paxton is 40 km from Saffron Walden. The
  venue table has exactly one "The Bull Pub", so exact name wins with nothing to compare it to. Same shape:
  `The Railway Tavern [Norwich]` → `[Dereham]`; `Kings Forest Car Park [West Stow]` → `[Bury St Edmunds]`.
- **The foodPark case** — `foodPark [CB1]` → `foodPark [Cambridge] CB2 0AA`, six Pig-Casso's dates. The
  event's "village" is the string `CB1`, which agrees with nothing, so the matcher falls through to "pick
  the exact name" and lands on the Biomedical Campus row, 2.2 km from the one it plainly means.

**The 4 that do not resolve are not venues at all.** `G's Family Day`, `Haircut 5pm`, `Haircut`, `Physio` —
each matched a venue *row* of the same name that has no coordinates. These, with `Gas delivery`, `Poss
leave`, `dr appointment`, `Busy`, `Prep for Armour fest`, are **Marky D's personal calendar being scraped
as a schedule** and minted into `venues`. That is a data-quality problem upstream of any rule.

## What the duplicate rule then finds (d)

Applying those 71 resolutions in memory only, the 500 m rule goes from **6 duplicates over 104 judgeable
pairs** to **12 over 178**, with **3 pairs still unjudgeable** (the calendar rows). Six new pairs:

- **Nomadough's Biomedical pair — surfaces at 0 m, as expected.** Also Nomadough 11 Sep `The Bull` /
  `foodPark Biomedical Campus` (0 m, both resolving to CB11 4SB rows — which is itself suspicious, see the
  postcode section) and both against `Langley Lower Green` at 210 m.
- The Forge Kitchen 12 Sep `Wine-boutique, Felixstowe` / `Wine-Boutique` — 0 m, but only because **both**
  land on a venue row filed under Sudbury; the pair is right, the venue row's village is not.
- Nomadough 19 Sep `IVO Brewery` / `Burleigh Hill Farm` — 0 m, identical coordinates: one brewery on one
  farm, two names.
- **Pig-Casso's `foodPark` / `FoodPark CB1` — does not surface (see the correction above).** Had the
  matcher chosen `FoodPark CB1`, all six dates would be duplicates at 0 m.

## The postcode question — measured before you commit to it

**First, so you know which case you are looking at: 116 distinct venue pairs share a full postcode**
(60 postcodes, 599 of 819 venues carry one, 115 pairs measurable). The rule is not firing on nothing.

**How far apart are they?**

| distance | pairs |
|---|---|
| ≤ 100 m | 43 |
| 100–500 m | 18 |
| **500 m – 1 km** | **24** |
| **1–2 km** | **13** |
| **> 2 km** | **17** |

**54 of 115 pairs (47%) sharing a full postcode are more than 500 m apart.** Your instinct about rural
postcodes is right in the venue table. Examples: `Sudbury Market` ↔ `Sudbury Street Food Festival` 2.0 km
(CO10 2EU); `Ashdon Village Hall Car Park` ↔ `Ashdon Baptist Church Car Park` 2.3 km (CB10 2HB);
`Alconbury Weald` ↔ `Co-op` 2.1 km (PE28 4XA); `Ridgewell Village Hall` ↔ `Great Yeldham Village Centre`
1.4 km (CO9 4PT) — different villages under one postcode. The largest, 4.7 km inside PE19 0AW, is four
Wintringham rows where one has a bad coordinate, not a 4.7 km postcode.

**But on the events, today, the postcode rule adds exactly 4 pairs the 500 m rule misses — and all four
are right:**

| date | truck | pair | distance | postcode |
|---|---|---|---|---|
| 11 Sep, 9 Oct, 13 Nov | Pig-Casso's | `foodPark` / `FoodPark Biomedical` | 512 m | CB2 0AA — the case you cited |
| 25 Sep | Marky D's | `Lingwood Village Hall Karaoke` / `Lingwood Village Hall` | **2,553 m** | NR13 4AZ — same hall by name; one row's coordinate is 2.5 km out |

The same four before and after the resolutions; the resolutions add nothing to the postcode side.

**Where it would go wrong.** The danger is not rural pubs — it is the handful of postcodes stamped on
*placeholder* rows: **NR1 1AA** (Norwich centre) carries `Dog show`, `Gas delivery`, `Lord Nelson`, `Marky
D's`, `Busy`, `Poss leave`, `Armour fest` — 21 of the 116 pairs are inside this one postcode; **CB2 1TN**
carries `Private Party`, `Body Funk`, `bank Holiday Monday`; **NR13 3AA** carries `Fardons at The Swan`,
`Ranworth beer festival`, `No RWE`. If Marky D's ever has "Dog show" and "Lord Nelson" on the same day,
the postcode rule fuses them and the 500 m rule (767 m apart) would not. **That is a venues-table hygiene
problem wearing the rule's clothes**: the rule is sound on real venues today, and unsound on rows that
should never have been venues.

**My recommendation, for you to accept or not:** keep "same full postcode OR ≤ 500 m", because on the live
events it is 4-for-4 and catches your CB2 0AA case; but in C2 record `postcode` as the rule that fired so
those marks are auditable, and treat the placeholder postcodes as a clean-up item that runs *before* the
one-off pass — otherwise the pass will fuse calendar entries.

---

# PART TWO — THE DETAIL

## 1a. The 71 resolvable rows, by proposed venue

`findVenue(venue_name, village, allVenues)`; basis derived by re-running the matcher's own steps
(`normName` equality, token-subset direction, `villageAgrees`, the 15 km ceiling).

| n | event venue [village] | → proposed venue [village] postcode | truck(s) · dates | basis | conf |
|---|---|---|---|---|---|
| 17 | The Bull Pub [Great Paxton] | The Bull Pub [Saffron Walden] CB11 4SB | Perky Beans · 11 Sep–6 Nov | exact name; village **disagrees** | low |
| 16 | The Street [Capel St. Mary] | The Street [Capel St. Mary] IP9 2EP | The Travelling Friar · 15 Sep–5 Nov | exact name; village agrees | high |
| 6 | foodPark [CB1] | foodPark [Cambridge] CB2 0AA | Pig-Casso's · 25 Sep–27 Nov | exact name; village **disagrees** (see §1d) | low |
| 4 | Blackpit Brewery [Stow-Bridgwater] | Blackpit Brewery [Stowbridge] — | Hot Dog Mafia · 26–29 Nov | exact name; village disagrees (spelling) | low |
| 2 | Market Square [Bildeston] | Market Square [Bildeston] — | The Travelling Friar | exact; agrees | high |
| 2 | Rougham Estate Pumpkin Patch [Rougham] | same, IP30 9LZ | Pigs In | exact; agrees | high |
| 1 | Wine-Boutique [Felixstowe] | Wine-Boutique [Sudbury] CO10 2AG | The Forge Kitchen · 12 Sep | exact; village **disagrees** | low |
| 1 | Off The Beaten Truck - Wintringham [Wintringham] | Off The Beaten Truck, Wintringham [St Neots] PE19 0AW | Pig-Casso's · 11 Sep | exact; disagrees | low |
| 1 | The Railway Tavern [Norwich] | The Railway Tavern [Dereham] NR19 1HB | Zaket Potato · 14 Sep | exact; **disagrees** | low |
| 1 | Wintringham Plaza [Wintringham] | same, PE19 0AW | Perky Beans · 6 Nov | exact; agrees | high |
| 1 | Thelodgebar [Bury Saint Edmunds] | Thelodgebar [—] — | Pigs In · 26 Sep | exact; venue has no village | low |
| 1 | foodPark [Cambridge] | foodPark [Cambridge] CB2 0AA | Pizza Mondo · 11 Sep | exact; agrees | high |
| 1 | Newton Flotman Quiz Night [—] | same [Unknown] NR16 1QQ | Marky D's · 2 Oct | exact; no village to check | low |
| 1 | Newton Flotman Social club [Newton Flotman] | same, NR15 1RF | Marky D's · 2 Oct | exact; agrees | high |
| 1 | Thedwastre Close [Elmswell] | same, IP30 9UJ | The Travelling Friar · 6 Nov | exact; agrees | high |
| 1 | Kings Forest Car Park [West Stow] | same [Bury Saint Edmunds] IP28 6UT | Pigs In · 27 Sep | exact; **disagrees** | low |
| 1 | FoodPark CB1 [Cambridge] | same, CB1 2GA | Steak & Honour · 11 Sep | exact; agrees | high |
| 1 | The Boot [Dullingham] | same, CB8 9XA | Steak & Honour · 11 Sep | exact; agrees | high |
| 1 | The Bull [Langley] | The Bull [Lower Green] CB11 4SB | Nomadough · 11 Sep | exact; disagrees (Langley Lower Green) | low |
| 1 | foodPark at The Green & The Gardens… [Cambridge] | same, CB2 0BB | Nomadough · 11 Sep | exact; agrees | high |
| 1 | foodPark Biomedical Campus [Langley] | same [Langley] CB11 4SB | Nomadough · 11 Sep | exact; agrees | high ⚠ |
| 1 | Langley Lower Green [Langley] | same — | Nomadough · 11 Sep | exact; agrees | high |
| 1 | The Affleck Arms [—] | same [Dalham] CB8 8TG | Pigs In · 25 Sep | exact; no village to check | low |
| 1 | ITFC, Portman Road [Ipswich] | same, IP1 2DA | The Forge Kitchen · 15 Sep | exact; agrees | high |
| 1 | Dog Day Fairhaven [Unknown] | same [Unknown] NR32 4TT | Marky D's · 13 Sep | exact; "Unknown" = "Unknown" | low |
| 1 | Dog show (CXD) [Norwich] | same — | Marky D's · 13 Sep | exact; agrees | high |
| 1 | Dog show [Norfolk] | same, NR1 1AA | Marky D's · 13 Sep | exact; agrees | high |
| 1 | Gas delivery [Norfolk] | same, NR1 1AA | Marky D's · 16 Sep | exact; agrees | high |
| 1 | IVO Brewery [St.Ives] | same [St. Ives] PE27 3LY | Nomadough · 19 Sep | exact; agrees | high |
| 1 | Burleigh Hill Farm [St. Ives] | same, PE27 3LY | Nomadough · 19 Sep | exact; agrees | high |

⚠ `foodPark Biomedical Campus` filed under **Langley, CB11 4SB** with coordinates 0 m from `The Bull
[Lower Green]` — the Cambridge Biomedical Campus is not in Langley. That venue row is wrong, and it is
the reason Nomadough's `The Bull` / `foodPark Biomedical Campus` reads as a 0 m duplicate.

## 1b. The 4 that do not resolve

| date | truck | scraped venue | why |
|---|---|---|---|
| 27 Sep | Pigs In | `G's Family Day` [—] | matched a venue row of that name with **no coordinates** |
| 7 Oct | Marky D's | `Haircut 5pm` [Norfolk] | matched a venue row of that name with no coordinates |
| 7 Oct | Marky D's | `Haircut` [Unknown] | same |
| 16 Sep | Marky D's | `Physio` [Unknown] | same |

Each has an exact-name venue row (the scraper minted it) with no coordinates because the geocoder had
nothing to geocode. Three are a person's appointments, not a schedule.

## 1d. The rule, re-run with the resolutions applied in memory

| | judged | ≤ 500 m | unjudgeable |
|---|---|---|---|
| before resolutions | 104 | 6 | 77 |
| **after resolutions** | **178** | **12** | **3** |

The six original pairs are unchanged (Pig-Casso's FoodPark Biomedical/Biomedical Campus ×3 at 26 m; Elder
Street Food The Common 0 m; Gusto Wickhambrook MSC/MSC 0 m; Forge Kitchen Debenham/Debenham Vets 0 m). The
six new ones are listed in Part One. Still unjudgeable: Pigs In `G's Family Day`/`Kings Forest Car Park`;
Marky D's `Haircut 5pm`/`Haircut` and `Gas delivery`/`Physio`.

**Why the expected Pig-Casso's pair is missed — the trace.** `findVenue("foodPark", "CB1")`:
- Step 1 finds **10** candidates — every foodPark row, because `foodpark` ⊆ each name's tokens.
- Step 2: the event's village tokens are `["cb1"]`; no candidate's village contains it, and no candidate's
  village appears inside the scraped name → **zero** agreeing candidates.
- Step 3: deterministic `pickBest` across all 10 → exact normalised name wins → `foodPark [Cambridge]
  CB2 0AA`, confidence *low*.
- That row is **2,212 m** from `FoodPark CB1` (CB1 2GA). All six same-day pairs judge *distinct*; had the
  resolution been `FoodPark CB1`, all six would be duplicates at **0 m**.

The pattern — exact name beats a disagreeing village — is the same one behind Perky Beans × 17, the
Railway Tavern and Kings Forest rows. For C2 this means: **a low-confidence resolution must not be applied
unattended**, and the scraped `village` field is doing real work that a postcode fragment like `CB1`
defeats.

## Postcode: the venue pairs, in full

115 measurable pairs are listed in the run output (`c1.out`); the shape is in Part One. Beyond 500 m the
list is dominated by (i) placeholder rows under NR1 1AA / CB2 1TN / NR13 3AA / NR29 5NY, (ii) same-name
rows with one bad coordinate (Wintringham PE19 0AW ×4 at 4.7 km, Lingwood NR13 4AZ at 2.5 km, Affleck
Arms CB8 8TG at 2.9 km, King's Head Fen Ditton 808 m), and (iii) a smaller set of genuinely different
places under one postcode (Sudbury Market/Festival 2.0 km, the two Ashdon car parks 2.3 km, Alconbury
Weald/Co-op 2.1 km, Ridgewell/Great Yeldham 1.4 km, Bramford/Loraine Victory Hall 739 m, Aldringham/Mill
Hill 1.9 km). Category (iii) is the one your concern is about; it exists, it is a minority, and none of its
pairs occur on the same day for the same truck in the current future events.

---

# WHAT C2 WILL LOOK LIKE (described, not built) — with what this run changes

Unchanged from the plan: a shared `lib/` gate every writer calls; truck by the existing normaliser + aliases;
venue resolve-or-create with name/village/postcode/distance; duplicate = same date + same truck + (same
full postcode **or** ≤ 500 m), newest wins, time gap recorded only; insert; **never inside
`/api/inbound-schedule` before its bridge loop** (re-confirmed today); duplicates stored and marked, never
deleted. `visibility`/`show_on_vf`/`show_on_hg` can hide a row but cannot record *why*, so a migration adds
`superseded_by`, `superseded_reason`, `superseded_meta` (rule · metres · postcode-match · both sources · time
gap) and `superseded_at` — written when you ask, not applied by me. The scraper posts to the gate. The
delete job stays separate: FK **or** name exclusion, a count floor set from the measured 4–44/day (with a
one-off override for the 230-row backlog), its own red-on-failure, and run-log pruning as a separate step
with its own count.

**Three things this run adds to that design:**
1. **Confidence gates the one-off pass.** Apply `high` resolutions; hold `low` ones for review — 36 of the
   71 are low, and at least Perky Beans × 17 is likely wrong.
2. **Clean the placeholder venues before the pass**, or the postcode rule will fuse calendar entries.
3. **Fix the two venue rows the run exposed** — `foodPark Biomedical Campus` filed under Langley, and the
   `foodPark` CB2 0AA coordinate 512 m from its postcode's other rows — before trusting either in a
   distance rule.

---

# HOW I CHECKED

**Executed:** the shipped `findVenue` over all 75 unlinked rows; the scraper's own `normalizeName` for truck
grouping; the 500 m rule before and after in-memory resolutions; every haversine distance; the full
postcode-pair census; the step-by-step trace of the foodPark/CB1 decision; the re-derivations of every
figure carried from the three earlier reports.

**Structural:** the bridge placement (`grep -n` on the route, exit 0 — found the upsert at one line and the
`rows` loop at another; no other `discovery_events` reference).

**Reasoned:** which low-confidence resolutions are "probably right" versus "probably wrong" (Part One) —
judgement on place names, not measurement — and the recommendation on the postcode rule.

**Not done:** no resolution applied, no row marked, no venue corrected, no migration written.
