# Matching Rules Review & Linking-Pass Scope

**7 September 2026 · diagnose-and-scope only · no code changed, scraper not run, no backfill applied, nothing committed**

**Marking.** 🔎 source-read · 🧪 executed. Every live call was a `select` or a read-only `postcodes.io` lookup. **No venue or event row was created, updated or deleted.**

---

## 🔴 AT THE TOP, BECAUSE THE PROMPT ASKS FOR IT THERE

**I could not find a truck-venue history matcher in the code, and — separately — I measured whether one would help. It would not, for a reason that matters more than its absence: the only history that exists was produced by the same matcher, so using it would be circular.**

🧪 Of the 133 low-confidence links the backfill proposes, the truck+venue pair has **exactly one** historical venue in **33** cases — and in **all 33 the matcher already agrees with history. Zero disagreements.** In **91** cases the history is itself **split across different venues** for the same truck at the same venue name. History is not an independent signal here; it is an echo.

**So the 21% village-name loss is NOT avoidable via history.** ⚠️ But it is **narrower than I implied last round**, for a different reason given in Part B — and I was wrong to present 21% as the operative number without saying which population it applies to.

🔴 **And I found something worse than anything in Part B.** The backfill's **HIGH-confidence** output — the file intended to be run by hand — contains **clear mislinks, the largest at 65.5 km**: `"The White Swan" [Bluntisham] → "The Swan" [Monks Eleigh]`. 🔎 The cause is one line in `lib/venue-matcher.ts:88`: `if (cands.length === 1) return { venue: cands[0], confidence: 'high' }` — **when exactly one candidate survives token containment, the village is never checked at all.** "high" does not mean "village agrees"; it means "only one name matched". **The .sql as generated must not be run.**

---

# PART A — THE SEARCH FOR HISTORY-BASED MATCHING

## A1. What I searched. An empty result is only evidence if the search was wide.

Every search below ran **recursively from the repo root over all file types**, excluding only `node_modules/`, `.next/`, `.git/`, `ios/`, `android/`. 🔎 The pipeline lives in `.js`, `.cjs`, `.mjs`, `.ts`, `.tsx`, `.yml` and `.sql`; **no search was scoped by extension.**

| Pattern class | Terms | Hits that were a venue-history matcher |
|---|---|---|
| Temporal language | `previous` · `prior` · `history` · `historic` · `last_seen` · `lastSeen` · `seen_before` · `repeat` · `been here` · `past event` · `pastEvent` | **0** |
| Named variables | `previousVenue` · `lastVenue` · `known_venue` · `knownVenues` · `recentVenues` · `previousVenues` · `venueOptions` · `uniqueVenues` | **0** (no such identifier exists) |
| Frequency logic | `most_common` · `mostCommon` · `commonest` · `frequen` · `usual` | **0** |
| Past-event queries | `order('event_date', { ascending: false })` · `lt('event_date'` · `lte('event_date'` · every `from('discovery_events')` and `from('truck_events')` call site (**110 call sites, all read**) | **0** |
| Truck×venue joins | `truck_name.*venue_name` · `discovery_truck_id.*venue_id` · `eq('truck_name'` · `eq('discovery_truck_id'` | only dedup conflict keys and the backfill's own selects |
| Operator UI suggestion | `datalist` · `autocomplete` · `suggest` | **0** venue suggestion of any kind |
| Alias tables | `aliases` across all files | truck aliases only — **no venue alias is ever read** |
| Docs | `been there before` · `previously pitched` · `pitched at` · `repeat pitch` · `prior event` · `past venue` across `docs/*.md` | **0** |

🔴 **A1 conclusion: no code anywhere in this repository resolves a venue by asking where that truck has been before.** ⚠️ Absence is reported as absence, and the boundary is stated in "what I could not verify": the **Google Apps Script** pipeline is not in this repository and I cannot read it.

## A2. Not applicable — it does not exist in code

There is therefore nothing for the geocoder change to have bypassed. 🔎 For completeness, the geocoder change touches **venue creation** (`scripts/run-scraper.js` → `scripts/geo-validate.js`); it does not touch **event→venue matching**, which is where a history signal would live. The two are separate stages.

## A3. What else explains correct historical matching

The operator's experience is real; these are the mechanisms that produce it, none of which is truck-keyed history:

1. 🔎 **The Sheet's Venues tab IS the accumulated history.** A venue a truck pitched at before was appended to that tab by an earlier run, and every later event fuzzy-matches against it (`run-scraper.js:797-852`). "It knows where they've been" is true — the memory is the venue list, not a per-truck record.
2. 🔎 **Recurring-rule expansion.** `manual` / `scrape_rules` strategies extract a *rule* ("Tuesdays at the Fox") and `generateDatesFromRule` emits up to 60 days of the same truck at the same venue. **This is literally "they were there before, so they will be there again"** — and it is the closest thing in the code to what was described.
3. 🔎 **The dedup set.** `existingEvents` is built from the Sheet's Events tab — truck + venue + date — and is truck-venue history, used to *suppress* re-adds, not to resolve location.
4. 🔎 **Truck aliases** (Trucks tab column R) — resolves truck *names*, never venues.
5. 🔎 **`rejected_event_signatures`** — history-based suppression of events an operator rejected. ⚠️ `app/api/events/action/route.ts:185` records that it **has never received a single row**.
6. 🔎 **`lib/schedule-extract.ts:85`** asks Gemini: *"If the venue name is ambiguous (e.g. 'The Fox') and you have a postcode or town → use that to identify the correct venue."* Disambiguation by town — from the model's world knowledge, not from this truck's past.
7. 🔴 **The Apps Script**, which produces 29 of the 669 future events (`Drive Screenshot`, `Mobile Screenshot`). **Unreadable from here.** If a per-truck history matcher exists anywhere, this is where it is.

## A4. 🔴 EVERY MATCHING AND DEDUP RULE IN THE PIPELINE

The operator's position is that these work and should be followed. Enumerated so the linking pass uses them rather than inventing its own.

### Normalisation — two byte-mirrored implementations

| | |
|---|---|
| 🔎 `normalizeName` (`run-scraper.js:48`) / `normalizeVenue` (`lib/venue-signature.ts:8`) | lowercase → `&`→`and` → strip punctuation → **strip filler words `the\|street\|st\|food\|ltd\|co\|company\|and`** → chop trailing `s` per word → join with no spaces |
| 🔎 `normName` (`lib/venue-matcher.ts:27`) | lowercase → strip everything non-alphanumeric. **Keeps the filler words.** |

🔴 **These two disagree.** "The Street" normalises to `""` under the first and `thestreet` under the second. 🧪 Visible in the results: `"The Street" [Capel St. Mary]` is proposed against `"The Street" [Whatfield]`, 9.1 km away.

### Fuzzy equality

- 🔎 `isFuzzyMatch` (`run-scraper.js:60`) / `venuesFuzzyMatch` (`lib/venue-signature.ts:20`) — **Levenshtein ≤ 1**, byte-mirrored, on the *smashed* string.
- 🔎 `venueNameDedupMatch` (`inbound-schedule:20`) — fuzzy **OR** containment, with a **minimum length of 5** so a short generic token cannot swallow an unrelated venue. ⚠️ **The scraper's bare `.includes` has no such length gate.**

### Truck identification

🔎 `run-scraper.js:762-792`. A truck page **is** its truck (no matching). Otherwise fuzzy-or-substring against Sheet truck names **and aliases**; no match → new truck, stamped `exclude_reason: 'Yes - New Truck'`.
🔎 `inbound-schedule:78-86` — `normName` equality **or containment either way**. 🔎 `lib/utils.ts:205` — exact name, then the alias list.

### Venue identification — 🔴 two different algorithms for one question

**(a) The scraper** (`run-scraper.js:797-852`): postcode regex first; otherwise a **score**: fuzzy name **+100**; substring **+10**, then **+50 if the DB village appears in the event text**, **−20 if it does not**; **−5** if lengths differ by > 5. Only `score > 0` qualifies.
🟢 **Note what this does that the other one does not: it penalises village disagreement (−20) and rewards agreement (+50) even in the substring branch.**

**(b) `findVenue`** (`lib/venue-matcher.ts:75-105`), used by `/api/inbound-schedule`, `backfill-venue-id.ts` and `reresolve-event-venues.ts`:
1. Candidates by **token containment either way** (stopwords `the pub inn tavern arms bar hotel and at on of` removed), or exact `normName`.
2. `0 candidates` → `none` — **the only null result**.
3. 🔴 **`1 candidate` → `high`. The village is never consulted.**
4. `≥2` → rank by village agreement; one agreeing → `high`; several agreeing → exact name `high`, else deterministic `pickBest` → `low`; none agreeing → `pickBest` across all → `low`.

🔴 **Step 3 is the defect behind every large HIGH-confidence error in Part C.**

### Dedup

| Layer | Rule |
|---|---|
| 🔎 Scraper (`:881`) | same date **AND** fuzzy truck **AND** fuzzy venue, against the Sheet's Events tab |
| 🔎 DB mirror (`:1638`) | `onConflict: 'event_date,truck_name,venue_name'` |
| 🔎 inbound-schedule (`:108`) | same conflict key, `ignoreDuplicates:false` (updates) |
| 🔎 Bridge (`:190-199`) | **primary** `(truck_id, event_date, venue_id)` when both resolve; **fallback** `venueNameDedupMatch` on the immutable `scraped_signature` |
| 🔎 Reject memory (`:164`) | `(truck_id, event_date)` + strict Lev-1 on `scraped_signature` — deliberately *not* loosened |
| 🔎 `lib/event-conflicts.ts` | read-time: **postcode-anchored duplicate** (name excluded) and **time overlap** — warn, never block |

### Filters

🔎 Historical date · fuzzy exclusion against the Exclusions tab · **hard `private` filter** on `venueName + notes` · `INVALID_VENUES = ['Closed','N/A','TBC','Unavailable','Cancelled']` (operator importer only).

---

# PART B — RECONSIDERING THE 21%

## B1. What history would recover: nothing, and the reason is circular

🧪 Paged over **all 1,724** events that carry a `venue_id` (⚠️ my first attempt returned exactly 1,000 rows — PostgREST's cap — and its numbers were wrong; re-run with pagination):

| For the 133 low-confidence links | count |
|---|---|
| truck+venue pair has **exactly one** historical venue | **33** — matcher **agrees in all 33, disagrees in 0** |
| history **split** across several venues | **91** |
| no history for that pair | **9** |

🔴 **Every venue_id in that history was written by `findVenue` itself** — via `/api/inbound-schedule` or the July backfill. Feeding it back in would be the matcher marking its own homework, and the 91 split cases show the history is not even self-consistent.

*Failure mode if this proved nothing:* if the history table were small or unrepresentative the agreement would be meaningless — hence the paged count (1,724 rows, not the capped 1,000) and the explicit split/absent breakdown.

## B2. 🔴 A correction to my own last report

The **21%** figure was measured over **the 314 distinct village names already in `venues`** — not over the venues a scrape actually queues. Presenting it as "the loss" was imprecise. What it means: 65 of 314 stored village names are ambiguous **when no postcode is present**. With a postcode the ambiguity is resolved. I still cannot measure the queue-time rate without running the scraper.

## B3. Recommendation: **store at low confidence and surface, do not drop** — with one condition

🟢 **Recommended:** an ambiguous village should produce a venue row **with no coordinates** (which is already what the geocoder does), and the *event* should be linked at **low confidence and surfaced for approval** rather than silently dropped or silently pinned.

Reasoning, from the evidence in Part C: a dropped event is invisible but harmless; a **silently pinned** wrong event sends customers to the wrong village. The existing codebase already has the right shape for this — `venue_match_confidence` is written today, and (this workstream) the approval card now shows it. 🔴 **The condition: low-confidence links must not be written into `discovery_events` unattended**, because scraped discovery events have **no approval screen at all** — only operator `truck_events` do. Until a review surface exists for discovery links, low-confidence links belong in the CSV, not in the database.

🔴 **I have changed nothing in the geocoder in this task, as instructed.**

---

# PART C — THE LINKING PASS

## C1. What `scripts/backfill-venue-id.ts` does

🔎 Read in full. Emit-only by default; `--apply` optionally writes. Scope: `discovery_events WHERE venue_id IS NULL AND event_date >= today`. For each event it calls **`findVenue`** — the shared matcher (A4b), **not** the scraper's own scorer (A4a) — and requires the matched venue to carry coordinates. `high` → `backfill-venue-id.sql` (guarded `AND venue_id IS NULL`, so idempotent and reversible); `low` → `review-low-confidence.csv`; plus a snapshot JSON for reversal.

🔴 **It uses `findVenue`'s rules, not the scraper's.** That matters: the scraper's scorer **penalises village disagreement (−20)**; `findVenue` **ignores the village entirely when there is one candidate**. The backfill is running the weaker of the two rules the operator says work well.

## C2. 🧪 Executed EMIT-ONLY against production

Ran unmodified (`npx tsx scripts/backfill-venue-id.ts`, no `--apply`), sha256 `ea6c82a2…49494ef`.

```
Scope: 600 null-venue future events (>= 2026-09-07)
  HIGH (in .sql): 435
  LOW  (in .csv): 133
  NONE (no coord-bearing venue): 32
```

| | |
|---|---|
| Future events today | 669 |
| Pinnable today | **69 (10.3%)** |
| Pinnable if the 435 HIGH links were applied | **504 (75%)** |
| Still unpinnable | 165 |

⚠️ **Housekeeping:** the run overwrote `backfill-venue-id.sql` and `review-low-confidence.csv` from 2 July. That directory is **gitignored**, so the tree is unaffected, and **the eight July artifacts are preserved** in the session scratchpad at `backfill-output-JULY-BACKUP/`.

*Failure mode if this proved nothing:* if the script had silently written to the database. It did not — `--apply` was not passed, the default branch prints `(emit-only — no DB writes)`, and 🧪 the pinnable count is still 69.

## C3. 🔴 EVERY LOW-CONFIDENCE LINK, IN FULL, WITH DISTANCES

133 events collapse to **21 distinct proposed links**. Distance = the event's own stated village (postcodes.io centroid) → the venue the matcher would attach it to.

| Distance | Events | Event venue [village] | → Proposed venue [village] | Truck |
|---|---|---|---|---|
| 🔴 **56.3 km** | 1 | freethrope village hall [Freethorpe] | Village Hall [Troston] | Zaket Potato |
| 🔴 **56.3 km** | 1 | freethorpe village hall [Freethorpe] | Village Hall [Troston] | Zaket Potato |
| 🔴 **45.5 km** | 1 | The King's Head [Pebmarsh] | The King's Head [Fen Ditton] | PIzza on the Green |
| 🔴 **43.2 km** | 1 | Little Thetford Village Hall [Little Thetford] | Village Hall [Troston] | The Purple Pepper |
| 🔴 **37.6 km** | 1 | Ridgewell Village Hall [Ridgewell] | Village Hall [Troston] | My Thai Chef |
| 🔴 **36.3 km** | **42** | The Bull Pub [Great Paxton] | The Bull Pub [Saffron Walden] | Perky Beans |
| 🔴 **35.2 km** | 8 | The Bull [Bottisham] | The Bull [Lower Green] | Holy Loaded |
| 🔴 **26.9 km** | 9 | The Plough [Great Shelford] | The Plough [Birdbrook] | Gino's Pizza |
| 🔴 **23.8 km** | 6 | The Railway Tavern [Norwich] | The Railway Tavern [Dereham] | Zaket Potato |
| ⚠️ **9.1 km** | 17 | The Street [Capel St. Mary] | The Street [Whatfield] | The Travelling Friar |
| ✅ 0.4 km | 1 | Off The Beaten Truck [Saffron Walden] | Off The Beaten Truck - The Common [Saffron Walden] | Nomadough |
| ❓ unknown | 9 | Barracks [Barracks] | Barracks [Sutton Heath] | White Gold |
| ❓ unknown | 9 | Near the Co op Store [Near the Co op Store] | Near the Co op Store [Laxfield] | White Gold |
| ❓ unknown | 8 | Near The King's Head Pub [same] | Near The King's Head Pub [Tollesbury] | White Gold |
| ❓ unknown | 8 | The Railway Inn Pub [same] | The Railway Inn Pub [Framlingham] | White Gold |
| ❓ unknown | 6 | foodPark [CB1] | foodPark [Cambridge] | Pig-Casso's |
| ❓ unknown | 1 | foodPark [Milton] | foodPark [Cambridge] | Nomadough |
| ❓ unknown | 1 | The Cross Keys [Henley] | The Cross Keys [Hatfield Peverel] | The Forge Kitchen |
| ❓ unknown | 1 | Off The Beaten Truck - Wintringham [Wintringham] | Off The Beaten Truck, Wintringham [St Neots] | Pig-Casso's |
| ❓ unknown | 1 | The Bull [Langley] | The Bull [Lower Green] | Nomadough |
| ❓ unknown | 1 | The Affleck Arms [—] | The Affleck Arms [Dalham] | Pigs In |

**9 links > 10 km · 7 > 30 km · 2 > 48 km (30 miles) · 10 whose village could not be located.**

🟢 The four **White Gold** rows are the landmark-named pitches — *Barracks*, *Near the Co op Store*, *Near The King's Head Pub*, *The Railway Inn Pub*. Their "village" repeats the venue name, so no distance is computable; **they are real pitches and must not be treated as junk.** Their proposed venue is the same name in a named village and is plausibly correct — but unverifiable without a postcode.

## C3b. 🔴 THE HIGH SET IS NOT SAFE, AND IT IS THE ONE IN THE .sql

🧪 Same distance test over the 435 HIGH links (82 distinct): **8 exceed 10 km.** Separating the two causes:

**Genuine mislinks — wrong venue, and they are in `backfill-venue-id.sql`:**

| Distance | Events | Event venue [village] | → Proposed [village] | Why |
|---|---|---|---|---|
| 🔴 **65.5 km** | 1 | The White Swan [Bluntisham] | **The Swan [Monks Eleigh]** | 🧪 `toks("The White Swan") = ["white","swan"]`; the only candidate is `The Swan` (`["swan"]` ⊆); **one candidate ⇒ `high`, village never checked** |
| 🔴 **43.4 km** | 1 | Wine-Boutique [Felixstowe] | Wine-Boutique [Sudbury] | single candidate, different town |
| 🔴 **34.8 km** | 1 | Busy [West Runton] | Busy [Norwich] | single candidate, different town |

**Correct links to a badly-geocoded venue** — the link is right, the *venue's stored coordinates* are wrong (these are the geocoder-report rows):

| 27.4 km | Hinchingbrooke house events [Hinchingbrooke] → same venue | the 76.8 km-from-its-postcode row |
| 10.7 km | The Warehouse Farmers and Craft Market [Setchey] → same | |
| 10.3 km | Pidley Community Centre [Pidley] → same | |

**Coarse village, probably fine:** Lingwood Village Hall [Norwich]→[Lingwood] 13.4 km; Ludham bridge [Great Yarmouth]→[Ludham] 10.1 km.

⚠️ **29 HIGH links have an unlocatable village**, so their risk is unmeasured.

## C4. Similarly-named venues, and what the matcher does with each

🧪 **12 venue-name groups collide across different villages:** *The Bell* (Kesgrave / Great Paxton / Bottisham) · *The Five Bells* (Colne Engaine / Cavendish) · *THE VILLAGE INN* (West Runton / Witchford) · *The Fox* (Lyng / Burwell) · *The Bell Inn* (Great Bardfield / Castle Hedingham) · *Co Op* (Chesterwell / Alconbury Weald) · *The King's Head* (Fen Ditton / North Lopham) · *The Lion* (Ickleton / Stoke by Clare) · *The Plough* (Shepreth / Birdbrook) · *The Red Lion* (Stretham / Great Sampford) · *Market Square* (Huntington / Bildeston) · *@Essexfoodiesmarket*.

🧪 With **no village supplied**, `findVenue` returns:

| Query | Rows | Returns | Confidence |
|---|---|---|---|
| **The Bull** | 2 — Lower Green, Saffron Walden | The Bull [Lower Green] | `low` |
| **The Plough** | 2 — Shepreth, Birdbrook | The Plough [Birdbrook] | `low` |
| **The Street** | 2 — Elmsett, Whatfield | The Street [Whatfield] | `low` |
| **foodPark** | **8**, all Cambridge except Genome Campus [Hinxton] | foodPark [Cambridge] | `low` |
| **Off The Beaten Truck** | **7** — Northstowe ×2, St Neots ×2, Saffron Walden ×2, Alconbury | Off The Beaten Truck [Northstowe] | `low` |
| **Village Hall** | 🔴 **43 rows** | **Village Hall [Troston]** | `low` |

🔴 **"Village Hall" is the worst case in the dataset.** 43 venues contain the phrase, and one row is literally named `Village Hall` in Troston — so *any* village hall the matcher cannot place lands in Troston. 🧪 That is exactly what produces the three 37–56 km links in C3 (Freethorpe, Little Thetford, Ridgewell).

🟢 **foodPark and Off The Beaten Truck behave better than feared**: all their variants sit in the same town, so a wrong pick is a few hundred metres, not miles. 🧪 The one OTBT link in C3 is **0.4 km**. ⚠️ The exception is *Off The Beaten Truck — Wintringham* [Wintringham] vs [St Neots], which are the same development under two names.

## C5. Would any link change a pin for a truck currently trading?

🧪 **No — verified, with the gate simulated rather than assumed.**

- 🔎 The backfill writes **`discovery_events.venue_id` only**. A trading truck's public pin comes from **`truck_events`**, which it never touches.
- 🧪 Operator trucks: `pizzeria-gusto` and `real-thai-food` are `is_customer=true, active, not excluded`. Their **discovery shadows are `excluded=true`**, so `app/api/discovery/events/route.ts:148` drops every scraped event of theirs.
- 🧪 Only **3** of the 600 in-scope events name a trading or linked truck, and all three are still hidden:

| Event | discovery_truck | Result |
|---|---|---|
| Pizzeria Gusto @ Nethergate Brewery [Long Melford] | `excluded=true, vf=false` | ✅ still hidden |
| Tikka Tonic @ Off The Beaten Truck - The Common | `excluded=true` | ✅ still hidden |
| Tikka Tonic @ Off The Beaten Truck - The Railway Arms | `excluded=true` | ✅ still hidden |

🧪 **570 of the 600** would become visible Village Foodie pins once linked — so the blast radius of a bad link is the public map, not a trading truck's own page.

*Failure mode if this proved nothing:* if I had checked only `truck_events` and not simulated the truck-level `excluded` / `show_on_vf` gate, an excluded shadow would look identical to a visible one. The gate was applied explicitly.

---

# PART D — WHAT ORDER TO RUN THINGS

Nothing below is built. Each step names what becomes visible, because that is the operator's question.

### Step 0 — Nothing is deployed yet
🔴 The geocoder work is **uncommitted**. Until it ships, the daily scrape still runs the old code. **Map today: 69 of 669 events (10.3%), 7 trucks.**

### Step 1 — Fix `findVenue`'s single-candidate branch ⚠️ NOT BUILT
🔴 **This must come before any linking.** `lib/venue-matcher.ts:88` returns `high` without checking the village; that is what produces the 65.5 km link **inside the .sql**. The fix is to demote a single candidate whose village disagrees to `low`.
**Depends on:** nothing. **Blocks:** Steps 2 and 4. **Map after: unchanged** — this is a correctness precondition, not a visible change.

### Step 2 — Run the linking pass, HIGH only, after Step 1
Re-generate and re-review; apply the `.sql` by hand. **This is the step that puts pins on the map.**
**Depends on:** Step 1. **Map after: 🟢 ~504 of 669 events (75%) and most trucks** — the single biggest visible win available today, and it needs **no scrape and no deploy**, only SQL.
⚠️ Applying today's un-regenerated `.sql` would also import the three mislinks above.

### Step 3 — Deploy the geocoder + validation change
**Depends on:** nothing (independent of 1–2). **Map after: unchanged today.** It stops *new* bad coordinates; it corrects none. Its value is prospective.

### Step 4 — Correct the 40 known-bad venues ⚠️ NOT BUILT
**Depends on:** Step 3's module (the resolver) for proposals; needs human review — one proposal moves a venue **116.8 km**.
**Map after:** 🟢 corrects **2 currently-wrong live pins** (*The Lion* Ickleton, 6.8 km out; *Bailey Hills Estate*) and improves accuracy for the rest. Small in count, high in trust.

### Step 5 — Let venue creation run again
**Depends on:** Step 3 (otherwise it creates more fabricated coordinates).
**Map after:** newly discovered venues start appearing. 🔴 **On its own it puts nothing new on the map**, because Pass A still writes `venue_id: null` — every new venue needs Step 2 to run again.

### 🔴 The standing gap
🔎 **Pass A never sets `venue_id`** (`run-scraper.js:1626-1636`). Until that changes, the linking pass is **not one-off — it is a permanent recurring chore.** Making Pass A call `findVenue` at write time would close it. **Not built, not in scope here.**

**Ordering summary:** **1 → 2** delivers the visible win. **3 → 5** stops the bleeding. **4** is cleanup. **2 must be re-run after every scrape** until the standing gap is closed.

---

# THE TREE

🧪 `HEAD = 08ac368`, `origin/main = 08ac368`, **0 staged, 0 committed, nothing pushed, nothing deployed.** `git add -A` / `git add .` were not run. **25 modified · 80 untracked** — unchanged from the end of the previous task except this report, which replaces an existing filename. No file in the working tree was edited in this task.

🧪 `scripts/backfill-output/` is **gitignored** (`.gitignore:51`), confirmed by `git check-ignore`; the emit-only run's artifacts do not appear in `git status`. The eight July artifacts are preserved in the session scratchpad.

🔴 **No venue or event row was created, updated or deleted. The scraper was not run. No backfill was applied.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The Google Apps Script pipeline.** It produces 29 of the 669 future events and is not in this repository. **If a truck-venue history matcher exists anywhere, it is there** — my "does not exist" finding is bounded by the repo.
- 🔴 **The Google Sheet's contents.** The Venues tab is the accumulated history that A3 identifies as the real mechanism, and I cannot see it.
- 🔴 **10 of the 21 low-confidence links have no measurable distance**, because their stated "village" is a landmark phrase (*Barracks*, *Near the Co op Store*) that no gazetteer resolves. Their risk is **unknown, not zero** — and they must not be dismissed as bad data.
- 🔴 **29 of the 82 distinct HIGH links likewise have an unlocatable village**, so the "8 links > 10 km" figure is a **floor, not a total**.
- ⚠️ **Whether the July `backfill-venue-id.sql` was ever applied.** Today only 69 future events carry a `venue_id` while 1,724 events overall do, so *something* was applied at some point; I did not establish what or when.
- ⚠️ **Distances use village centroids, not venue addresses.** A centroid is not a building, so sub-2 km figures should not be read as precision — only the large ones are conclusive.
- ⚠️ **Whether the three C5 discovery shadows stay excluded.** Verified as of today; a future un-exclude would expose those events.
- ⚠️ **I did not verify that `findVenue`'s behaviour is identical under the backfill's `tsx` runtime and my analysis** beyond both importing the same module file — they do, by absolute path, with no copy.
