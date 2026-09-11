# The venue-matching wall — diagnosis

**Diagnosis only.** No code, no schema, no migration, no database write. Every figure re-derived against
the live database on **12 September 2026**, snapshot taken at 14:32 UTC.

Live at that moment: **`discovery_events` 933** (the brief says 935 — it has moved by 2), **321 rows with
a null `venue_id`**, **703 future rows**, **225 of them unlinked**, **`venues` 819**.

---

## 🔴 FLAG: THE BRIEF IS WRONG ABOUT WHICH TABLE HOLDS THE BAD VILLAGE

> "venue rows carry a PLACE DESCRIPTION in the VILLAGE field — `Recreation Ground [Recreation Ground]` …"

**It is the EVENT rows, not the venue rows.** In every one of those examples the matched *venue* has a
perfectly good village:

| what the event says | what the venue it matched says |
|---|---|
| `Recreation Ground` **[Recreation Ground]** | `Recreation Ground` **[Bures]** |
| `Near The King's Head Pub` **[Near The King's Head Pub]** | `Near The King's Head Pub` **[Tollesbury]** |
| `Church View Campsite` **[Church View]** | `Church View Campsite` **[Barrow]** |
| `foodPark` **[CB1]** | `foodPark` **[Cambridge]** |

Two proofs, not one reading:

1. 🔎 The reject line is built as `` `${r.e.venue_name} [${r.e.village}] → ${r.v.name} [${r.v.village}]` ``
   — **the left bracket is the event's village**, the right is the venue's.
2. 🔎 `r5Accept` looks the anchor up with `anchors.get(normName(row.village))`, where `row` is the
   **incoming event**; anchors themselves are keyed on **venue** villages. "No anchor for village X"
   therefore means *the event said X and no venue lives in X*.

This matters because it changes the fix entirely: **the repair is upstream in the extraction, not a
clean-up of the `venues` table.** I have kept the rest of the report on the corrected footing.

⚠️ **And it corrects something I wrote.** §53.6 offers "33 of the 819 venue rows have a village that
equals their own name" as evidence for this problem. 🧪 Those 33 are **almost all legitimate** — they are
venues named after the village they sit in: `Framlingham` [Framlingham], `Newmarket` [Newmarket],
`Great Waldingfield` [Great Waldingfield]. They are not place descriptions and they are not the cause.
§53.6 conflated an event-side defect with a venue-side statistic.

---

# 1 · WHERE THE BAD VILLAGE VALUES COME FROM

**The extraction prompt asks for something it cannot always get, and gives the model no way to say so.**

🔎 There are **three** village instructions in `scripts/run-scraper.js`. Two are mandatory with no escape;
one has an escape hatch:

| prompt | instruction | escape? |
|---|---|---|
| the **rule / manual-schedule** prompt | *"VILLAGE (MANDATORY): Always extract the town, village, or city into a separate 'village' field."* | ❌ **none** |
| the **event** prompt | *"**VILLAGE (MANDATORY):** You must extract the town, village, or city name."* | ❌ **none** |
| the **HatchGrab-loop (Pass B)** prompt | *"TOWN RULES (IMPORTANT): ALWAYS populate 'town' … **If the town truly cannot be determined, use ''.**"* | ✅ **yes** |

**The same file already knows how to write the escape.** In the very prompt that forces the village, rule
9 reads *"MISSING TIMES: If no time is explicitly stated for a venue, output '' (an empty string)"*. Times
get permission to be absent. Villages do not.

🔴 **The control, and it is decisive.** If the mandatory wording is the cause, the writer using the prompt
*with* the escape hatch should produce none of this — and it produces none:

| writer | rows | village == venue name | future unlinked | R5 rejects |
|---|---|---|---|---|
| **Manual Entry** (rule prompt) | 252 | **62** | 122 | **122** |
| **`URL:` website scraper** (event prompt) | 518 | 12 | 102 | **102** |
| **`hg_scraper` Pass B** (prompt with the escape) | **86** | **0** | **0** | **0** |
| Apps Script screenshot | 66 | 2 | 1 | 0 |
| Admin upload | 8 | 0 | 0 | 0 |

**The two mandatory prompts produced 224 of 224 rejects. The one that permits an empty town produced 0 of
86 rows.**

**It is not a code fallback.** 🔎 The manual path builds each event as
`"Village": rule.village || ""` — if the model returned nothing, the column would be empty. These values
arrive **non-empty from the model**, which is what a mandatory field with no null option produces: asked
for a town that is not in the source text, it echoes the nearest string it has, which is the venue.

**`Manual Entry` is not a human typing.** 🔎 It is the scraper running a site whose
`strategy` is `manual` or `manual_single`; the schedule text is configured rather than fetched, and the
same AI prompt is applied to it.

**No bad venue row is created as a result**, which is why the `venues` table stays comparatively clean:
🔎 the scraper only queues a venue for creation when its *own* matcher failed, and these names match an
existing venue, so `newVenuesDetected` is never reached for them.

---

# 2 · CENSUS OF `venues` (819 rows)

| shape | rows | events attached |
|---|---|---|
| village looks like a real place | **732** | 584 |
| village **NULL or empty** | **43** | 12 |
| village **equals the name** | **33** | 12 |
| village is a **placeholder** (`Unknown`, `null`) | **11** | 4 |
| village is a **postcode fragment** | **0** | 0 |

⚠️ **The 33 "village equals name" rows are mostly correct**, as above. The genuinely useless ones are the
**11 placeholders**, and they are diary lines rather than venues: `Physio` [Unknown], `Haircut` [Unknown],
`8.55 appointment @ dr` [Unknown], `Transit Mot` [Unknown], `Dionne visit` [Unknown], `Dog Day Fairhaven`
[Unknown], `Newton Flotman Quiz Night` [Unknown], `Ranworth beer festival` [Unknown], `No RWE` [Unknown],
`Dolly's Pizza Van` [Unknown], `Kings Head Public House` [null].

🔴 **Grouping venues by writer is NOT recoverable.** `venues` has no `source`, `created_by` or equivalent
column — 🧪 its columns are id, name, village, postcode, latitude, longitude, owner_email, phone, premium,
website, schedule_url, ai_instructions, scraper_strategy, photo_url, aliases, created_at, updated_at.
Only `created_at` survives, and it records row creation, not authorship. **Stated rather than estimated.**

---

# 3 · HOW MANY OF THE 225 WOULD RESOLVE — MEASURED, WITH ITS LIMITS STATED

Of the 225 unlinked future rows: **224 are refused by R5**, and **1 has no candidate at all**
(`Newton Flotman Quiz Night`). Refusal reasons:

| rows | reason |
|---|---|
| **152** | no anchor for the **event's** village |
| **70** | the event's village has an anchor, but the venue is **> 15 km** from it |
| **2** | postcode-sector disagreement |

### What the event village actually contains, for all 224

| rows | class | example |
|---|---|---|
| **84** | **E** — a place name we hold no venue for | `Blackpit Brewery` **[Stow-Bridgwater]** (29), `Church View Campsite` **[Church View]** (27), `Roughacre Brewery` **[RoughAcre]** (26) |
| **70** | **F** — a *real* village with an anchor | `The Bull Pub` **[Great Paxton]** (42), `The Railway Tavern` **[Norwich]** (9) |
| **60** | **D** — village **equals the venue name** | `Recreation Ground`, `Barracks`, `Royal Square`, `Near the Spar Shop`, `Near the Co op Store`, `Near The King's Head Pub`, `The Railway Inn Pub` |
| **7** | **C** — village is a **postcode fragment** | `foodPark` **[CB1]** |
| **3** | **A/B** — empty or `Unknown` | `The Affleck Arms` [NULL] |

**All 60 of class D come from `Manual Entry`. None from any other writer.**

### 🧪 TEST 1 — the mechanical ceiling

Set each event's village to the matched venue's village, re-run **the matcher and R5**:
**221 of 224 would be accepted.** The 3 that still fail are 2 postcode-sector disagreements and 1 that is
still beyond 15 km.

🔴 **221 is a CEILING, NOT A FORECAST.** It assumes every venue the matcher proposed is the right one, and
that assumption is exactly what is in doubt. Reported as the arithmetic it is.

### 🧪 TEST 2 — is there independent evidence the match is right?

The only corroboration available is a postcode in the event's own text (`venue_name`, `village`,
`ai_notes`, `event_notes`) compared with the matched venue's postcode:

| | rows |
|---|---|
| event text carries a postcode at all | **4 of 224** |
| → sector **agrees** with the venue (match provably right, only the village wrong) | **1** |
| → sector **disagrees** (match provably **wrong**) | **2** |
| → matched venue has no postcode to compare | 1 |
| **event text carries NO postcode — no evidence either way** | **220** |

The two disagreements are worth naming, because both are cases where a village fix would have attached
the event to **the wrong place**:

- `foodPark` **[CB1]**, event postcode **CB1 2GB** ("3/4 Station Square Cambridge train station") →
  matched `foodPark` [Cambridge] **CB2 0AA**, which is the Biomedical Campus site. **A different foodPark.**
- `Wine-Boutique` **[Felixstowe]**, event postcode **IP11 7BL** → matched `Wine-Boutique` [Sudbury]
  **CO10 2AG**. Different county.

**So: 221 is the ceiling, 1 is what is proven, and 220 sit between them with no evidence in the row.**

### 🧪 TEST 3 — which rows need a *venue*, not a village

For every reject whose village does have an anchor, is there a same-name venue within 15 km of it?

| rows | event | same-name venues within 15 km | verdict |
|---|---|---|---|
| **42** | `The Bull Pub` [Great Paxton] | **0** | 🔴 **venue genuinely missing** |
| **9** | `The Railway Tavern` [Norwich] | **0** | 🔴 **venue genuinely missing** (its `ai_notes` say *"10 Dereham Road, Norwich"* — the matcher found the town of *Dereham*) |
| 1 | `Busy` [Cantley] | 0 | 🔴 missing |
| 1 | `Wine-Boutique` [Felixstowe] | 0 | 🔴 missing |
| 1 | `Dog Day Fairhaven` [Unknown] | 0 | 🔴 missing |
| **9** | `The Bull` [Bottisham] | **1** | ⚠️ **the matcher chose the wrong copy — see below** |
| **8** | `The Plough` [Great Shelford] | **1** | ⚠️ **same** |

### 🔴 A THIRD CAUSE THE MANUAL NEVER RECORDED: THE MATCHER PICKS BY UUID

For 17 rows the correct venue **already exists and is inside the ceiling**, and the matcher passed over it:

```
"The Bull"   [Bottisham]      → chose [Lower Green]  26.9 km   (ignored [Burrough Green]  8.8 km)
"The Plough" [Great Shelford] → chose [Birdbrook]    26.7 km   (ignored [Shepreth]        8.2 km)
```

🔎 **Why:** `pickBest` ranks candidates by (a) exact normalised name, (b) token overlap, (c)
**lexicographically smallest id**. When two venues share a name, (a) and (b) tie and the winner is decided
by **UUID ordering**. 🧪 Proven — `129e6b24…` [Lower Green] sorts before `4be59a60…` [Burrough Green], and
`23f66e26…` [Birdbrook] before `6d5a516a…` [Shepreth]. **Distance is never consulted**, although the
anchor needed to consult it is computed one function away in `applyDistanceCeiling`.

### The 224, resolved into what each actually needs

| rows | what it needs |
|---|---|
| **~150** (classes D, E, C, A/B) | a **correct village on the event** — ceiling only; 220 of the 224 carry no evidence that the matched venue is right |
| **53** | a **venue that does not exist yet** (Great Paxton's Bull Pub, Norwich's Railway Tavern, …) |
| **17** | **nothing but a better tie-break** — the venue exists, in range, and was passed over |
| **2** | neither — the match is provably wrong (`foodPark` CB1, `Wine-Boutique`) |

---

# 4 · THE WRONG-COUNTY SHAPE

🧪 **14 distinct venue names are held by more than one village, across 31 venue rows.** **67 events** are
attached to one of them, and **20 currently-unlinked events** carry a venue name that is duplicated.

| copies | name | villages |
|---|---|---|
| 3 | `The Bell Inn` | Castle Hedingham, Great Bardfield, Balsham |
| 3 | `The Bell` | Great Paxton, Bottisham, Kesgrave |
| 3 | `The Kings Head` | North Lopham, Fen Ditton, Pebmarsh |
| 2 | `The Five Bells` · `The Bull` · `The Plough` · `The Street` · `The Swan` · `THE VILLAGE INN` · `The Fox` · `The Greyhound` · `Co Op` · `The Lion` · `The Red Lion` | — |

⚠️ **`The Bull Pub` is not in this list**, and that is the point: it exists **once**, in Saffron Walden.
Great Paxton's is simply absent, so those 42 rows are a missing-venue problem and no tie-break helps them.

---

# 5 · PROPOSED FIXES, RANKED — NONE BUILT

| # | fix | kind | recovers | risk |
|---|---|---|---|---|
| **1** | **Give the two prompts the escape hatch the third already has** — replace *"VILLAGE (MANDATORY)"* with the Pass B wording, *"If the town truly cannot be determined, use ''"* | **code**, future scrapes only | **0 of the 225 today.** Stops the class recurring — 62 of 252 `Manual Entry` rows carry it now | Very low. An empty village is already handled everywhere: R5 refuses it and `venue_id` stays NULL, which is today's outcome anyway. ⚠️ It converts a wrong answer into an honest blank, which is a *smaller* number of linked events, not a larger one |
| **2** | **Make `pickBest` prefer the nearest candidate** when name and token overlap tie, using the anchor `applyDistanceCeiling` already computes | **code**, changes future *and* re-runnable over stored rows | **17** — measured, not estimated | Low, and it is the only fix here that is provably correct: it never chooses a *further* venue than today's rule |
| **3** | **Create the missing venues** — Great Paxton's `The Bull Pub`, Norwich's `The Railway Tavern` (Dereham Road), Cantley's `Busy`, Felixstowe's `Wine-Boutique` | **data**, one-off | **53** | Low if geocoded properly; these are real places the database simply lacks. ⚠️ Creating them with a wrong coordinate would put pins in the wrong place, so each needs a postcode |
| **4** | **Correct the village on the 60 class-D events** to the matched venue's village | **data**, one-off | up to **60** | 🔴 **Highest risk on the list, and it is not small.** For 220 of 224 rejects there is *no evidence* the matched venue is the right one, and where evidence exists it disagreed **2 times out of 3**. This writes a guess into a column that currently holds a visible mistake |
| **5** | **Ask the source for the postcode** — the event prompt already routes postcodes to `Notes`; route them to a column R5 can use, since 🧪 only **4 of 224** rejects carry one anywhere | **code**, future only | 0 today | Low. It is the only change that would make fix 4 safe later, by supplying the evidence that is missing now |
| **6** | Widen the 15 km ceiling | code | ~17, and the wrong ones | 🔴 **Do not.** It would accept `The Bull` [Lower Green] at 26.9 km — the exact wrong answer fix 2 removes for free. Listed so it is explicitly rejected |

**If you want the largest measured gain for the least risk: 2 then 3** — 70 rows, both provable, neither
guessing. Fix 1 is the one that stops tomorrow's 225 becoming 250.

---

# 6 · CAUSE AND SYMPTOM, PLAINLY

**The cause is the writer. Two extraction prompts demand a village the source text does not contain and
offer no way to decline, so the model invents one — usually by echoing the venue name.** The proof is the
control: the one prompt that permits an empty town has produced **0 bad villages in 86 rows**, while the
two that forbid it account for **224 of 224 refusals**.

**R5 is not the problem and must not be loosened.** It is doing exactly what it was built to do: refusing
to attach an event to a venue it cannot corroborate. Every one of the 224 refusals is correct on the
evidence available, and 2 of them are demonstrably right in the strongest sense — the postcodes prove the
match was wrong.

**Matcher tuning is compensation, with one exception.** Widening the ceiling, relaxing the anchor, or
accepting low-confidence matches would all raise the linked count by attaching events to venues nobody has
shown to be correct — trading a visible gap for an invisible error, which is the trade §53.2 exists to
refuse. **The single exception is the UUID tie-break**, and that is not tuning: choosing a 26.9 km venue
over an 8.8 km one when both are equally named is a defect with a correct answer, and fixing it makes the
matcher *more* conservative, not less.

**So: fix the prompt, fix the tie-break, create the missing venues. Do not rewrite 60 villages from a
guess, and do not widen the matcher.**

---

# HOW I CHECKED

The matcher and R5 were **executed**, not described — `findVenue`, `r5Accept` and `villageAnchors` were
loaded from the shipped source by compiling it with the repository's own TypeScript, then run over a
frozen snapshot of all 933 events and 819 venues. Test 1 re-ran the full matcher after patching the
village, rather than re-testing R5 alone, because the village feeds the matcher too. Distances are
haversine against the same median-of-village anchors the gate uses. The writer attribution comes from
`discovery_events.source`, and the prompt comparison from reading all three prompts in
`scripts/run-scraper.js` (no extension filter — the scraper is JavaScript).

**Not done:** no code change, no schema change, no migration, no database write, no scrape, nothing
installed, and `truck_events` was not touched.
