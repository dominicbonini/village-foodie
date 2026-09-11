# Duplicate events and duplicate venues — what the rules actually are

**Review only. Nothing was changed:** no code, no schema, no migration, no data write, and the scraper was
not run. Two files were read that the brief asked me to read first, and both contain claims the code no
longer supports — those are corrected immediately below, before anything else.

---

## 🔴 WHERE THE MANUALS ARE WRONG

**1. The venue matcher's "sole candidate = certainty" defect is listed as OPEN. It is fixed.**
`docs/reference-manual.md`, in the **Backlog** section, still says *"VENUE MATCHER — sole candidacy is
treated as certainty… `if (cands.length === 1) return { venue: cands[0], confidence: 'high' }` returns HIGH
with no corroboration whatsoever."* The shipped `findVenue` no longer does that: the single-candidate branch
now calls `villageAgrees` and then `applyDistanceCeiling`, exactly as the multi-candidate branch does. The
scraper manual records this fix (V1.1, 7 September); the app manual's backlog entry was never struck.

**2. "NOTHING READS `venue_match_confidence`" is no longer true.** The same backlog entry says the
confidence flag is written and read by nothing. It is now read in the operator dashboard
(`app/manage/[token]/page.tsx`) to show a *"we guessed this location"* warning on unconfirmed scraper
events. ⚠️ The important half of the claim still stands: **`discovery_events` has no confidence column at
all** — the flag exists only on `truck_events`, so no discovery event carries any record of how sure the
match was.

**3. Counts have moved.** The scraper manual's §5.1 says **574 venues**; live today it is **819**. Its §2.5
figures (4,301 events, 2,237 unlinked) are pre-deletion. Live today: **920 events**, **422 with no
`venue_id`**. The V1.8 changelog figures (902 events, 404 unlinked, 10 foodPark rows) are close and were
re-derived here as 920 / 422 / 10 — that manual is current, the body sections around it are not.

**4. One claim I could not test either way.** Both manuals state the unique index on
`(event_date, truck_name, venue_name)` exists. I measured **0 duplicate key groups across all 920 rows**,
which is consistent — but a query cannot distinguish "an index refused them" from "none happened to be
offered". Confirming it needs one SQL statement against `pg_indexes`, which PostgREST cannot reach and
which I did not run because it is outside this review.

---

# PART ONE — THE PLAIN-ENGLISH ACCOUNT

## The one-sentence answer

**There is only one duplicate check that actually protects the database, and it compares three pieces of
text exactly: the date, the truck's name, and the venue's name — so any event whose truck name or venue name
is spelled even slightly differently is, as far as the database is concerned, a completely different event.**

## The four ways an event can arrive, and what each one checks

Think of four doors into the same room. Only one of them has a proper doorman; the other three have a
turnstile that only stops someone wearing the *identical* clothes as a person already inside.

**Door 1 — the website scraper (the biggest by far: 754 of 920 rows).**
This is the only door with a real doorman. Before it writes anything, it holds up each event against a list
of events it already knows about and asks: same date? similar truck name? similar venue name? "Similar"
means it strips out punctuation, capitals and filler words, then allows one typo's worth of difference. If
all three match, the event is thrown away as a duplicate.

But the doorman has a list that is **not the database**. His list is the **Google Sheet's Events tab** —
a separate document that something outside this system prunes daily. So he can only recognise events that
are on that Sheet. Anything written to the database by the other three doors is **invisible to him**, because
those doors never write to the Sheet.

**Door 2 — the truck-schedule scraper (the "HatchGrab loop", 86 rows).**
No doorman at all. It posts its events straight to the shared writing desk, which has only the turnstile.

**Door 3 — the Google Apps Script (66 rows: screenshots dropped in Drive, vendor emails).**
No doorman at that door either. It does have a cleaner who tidies up *inside the Sheet* afterwards — a
routine that finds near-duplicate rows and deletes them — but **that cleaner never touches the database.**
The Sheet gets tidy; the database keeps both rows forever.

**Door 4 — the admin screenshot upload in your own admin screen (8 rows).**
No doorman. It checks that the event has a truck name, a date and a plausible venue name, and that the truck
isn't on the exclusion list — and then posts it to the same writing desk. **There is no duplicate check on
this path whatsoever.**

## The turnstile — the only thing the database itself enforces

Every one of those four doors ends at the same instruction: *"insert this event; if one already exists with
the same date AND the same truck name AND the same venue name, update that one instead."*

That is the whole rule. Three exact text matches. It cannot see:

- **times** — 16:00 and 16:15 are different events to it, and it would not care if they were identical;
- **the venue's identity** — two rows pointing at *the same venue record* but spelled differently are two
  events. That happens **10 times** in your data today;
- **which truck it really is** — "Between Buns" and "Between Buns Royston" are two different trucks to it;
- **anything the scraper's doorman knows** — the fuzzy rule never runs here.

## Why venues multiply

Two separate things get confused here, and the difference is the whole answer to the foodPark question.

**Matching a venue** happens on three of the four doors: when an event arrives, the system tries to find an
existing venue record so the event can be pinned on the map. This matcher is reasonably careful — it
compares the significant words in the name, checks the village agrees, and rejects a match more than 15 km
from where that village's other venues sit.

**Creating a venue** happens in exactly **one place in the entire codebase**: the website scraper, and only
for venues its *own* matcher failed to recognise. Nothing else ever creates one. The admin screenshot path
cannot create a venue. The Apps Script creates them **in the Sheet only** — they never reach the database.

And when the scraper creates one, the rule for "is this venue already here?" is **the exact name plus the
exact village**. Not the postcode. Not the coordinates. Not the distance. So:

> `foodPark` [Cambridge] and `FoodPark Biomedical` [Cambridge] are two venues — even though both carry
> postcode **CB2 0AA** and sit **1.8 km** apart. And `foodPark at The Green & The Gardens between Royal
> Papworth Hospital and AstraZeneca's DISC on the Cambridge Biomedical Campus CB2 0AA` is a third, 100
> metres from the second.

**Ten foodPark rows exist. Seven of them have events attached.** They were created because the scraper's
matcher — which uses a *different* rule from the map matcher — failed to connect a new spelling to an old
row, and the name-plus-village key had no way to notice they are the same pitch.

There is a second, quieter cause: **two matchers that disagree by design.** The scraper uses its own
"one typo" rule; everything else uses a token-overlap rule. A name one accepts, the other rejects.

## Why duplicates are still getting through — the five reasons, in order of size

1. **The doorman guards one door of four.** 166 of 920 rows arrived through doors with no duplicate check.
2. **The doorman's list is the Sheet, not the database.** Even for the door he guards, he cannot see
   anything the other three wrote — and he cannot see anything the Sheet's pruner has removed.
3. **The turnstile compares text, not identity.** Different spelling = different event, always.
4. **Nothing anywhere compares times.** Two rows for the same truck at the same pitch at 16:00 and 16:15
   are never once compared on time by any writer.
5. **The venue key is name-and-village, so the same pitch can exist ten times** — and once it does, events
   attach to different copies and look different to every rule downstream.

## What I measured

**920 events. 819 venues. 0 exact-key duplicates** (the turnstile is doing its narrow job).

**Probable duplicate pairs: 43 on a strict rule, 63 on a loose one.** Worst offenders: **Pizzeria Gusto
(19), Test Kitchen (16), Pig-Casso's (7), Nomadough (6).** The pairs are listed in full in Part Three, §5.

## ⚠️ About the Azahar case

**The exact pair you describe is not in the database today.** There is one Azahar row on 10 September (the
17:00 Northstowe one from the URL scraper) and no row anywhere called *"Azahar Artisan Spanish Food"*. The
Azahar admin-screenshot row that does exist is dated **9 September, 12:00, foodPark, Cambridge**. I assume
the second row was deleted after you spotted it.

**That does not weaken the case at all**, because an identical live example exists and I have used it as the
positive control instead:

> **Eat Greek, 9 September 2026, 17:00, Northstowe** — two rows.
> One says the venue is `Off The Beaten Truck - Northstowe` (URL scraper); the other says `Northstowe`
> (Drive Screenshot, i.e. the Apps Script). Same truck, same date, same time, same village, two rows.

The walk-through in Part Three §4 explains exactly which checks each row passed, and it is the same
explanation your Azahar pair would have had.

---

# PART TWO — THE NUMBERS, RE-DERIVED TODAY

All counts asserted against PostgREST's `content-range` header, not trusted from a previous report.

| | |
|---|---|
| `discovery_events` | **920** (`0-919/920`) — the manual's 4,301 is pre-deletion; V1.8's 902 was yesterday |
| `venues` | **819** (`0-818/819`) — the manual's §5.1 figure of 574 is stale |
| `discovery_trucks` | **231** (`0-230/231`) |
| Events with **no** `venue_id` | **422 of 920 (45.9%)** |
| Event date range | 2026-05-22 → 2027-02-01 |
| **Exact duplicates on `(event_date, truck_name, venue_name)`** | **0 groups** |

### Who wrote what, and what each writer manages to resolve

| Writer | rows | with `venue_id` | with `discovery_truck_id` |
|---|---|---|---|
| **A.** Website scraper, Pass A — writes to the database **directly** (`URL:…` + `Manual Entry`) | **754** | 367 (49%) | 78 (**10%**) |
| **B.** Truck scraper, Pass B — posts to `/api/inbound-schedule` (`hg_scraper:…`) | 86 | 64 (74%) | 85 (99%) |
| **C.** Google Apps Script — posts to `/api/inbound-schedule` (`Drive Screenshot`, `Mobile Screenshot`) | 66 | 56 (85%) | 65 (98%) |
| **D.** Admin screenshot upload — posts to `/api/inbound-schedule` (`Admin Screenshot`) | 8 | 8 (100%) | 8 (100%) |
| **E.** Hatches-Up import script (one-off) | 2 | 0 | 2 |
| **F.** Hand-inserted | 4 | 3 | 1 |

**The gap in one line:** the writer that produces **82% of all events** is the only one that does not run the
venue matcher, which is why half its rows cannot be pinned on the map.

---

# PART THREE — THE DETAIL, BY QUESTION

Citations are by **symbol**, not line number, because the manual records that the scraper's line numbers
move on every edit.

## 1. The full sequence, per writer

### Writer A — the website scraper (`scripts/run-scraper.js`), 754 rows

The only path with an event-level dedup rule.

1. **Load the dedup set** — `existingEvents` is built in the main body from `eventData`, and `eventData` is
   filled by `getTabData(sheets, TABS.EVENTS)`. 🔴 **Confirmed: it is the Google Sheet's Events tab, never
   `discovery_events`.** Each entry is `{ date: standardizeDate(...), truck: normalizeName(...),
   venue: normalizeName(...) }` — three normalised strings and nothing else. No time, no id, no village.
2. **Drop filters** (before dedup): historical date, excluded truck term, the word `private` in the venue
   or notes, empty page, and several silent ones the manual lists in §2.3.
3. **Resolve the truck** — venue-page sites take the site name; otherwise fuzzy-or-substring against Sheet
   truck names and aliases. No match ⇒ a *new* truck, queued as excluded.
4. **Resolve the venue** — `resolveVenueFrom`, described in §2 below. No match ⇒ queued into
   `newVenuesDetected` for creation, and the event is stamped `[⚠️ NEW VENUE]`.
5. **The dedup test** — `existingEvents.some(ex => ex.date === cleanDate && isFuzzyMatch(ex.truck,
   cleanTruckKey) && isFuzzyMatch(ex.venue, cleanVenueKey))`. `isFuzzyMatch` allows **at most one edit**
   on the normalised string. If it matches, the event is dropped entirely.
6. **Not a duplicate ⇒ appended to the Sheet, and pushed into `existingEvents`** so later events in the same
   run are compared against it too.
7. **The database mirror** — `supabase.from('discovery_events').upsert(batch, { onConflict:
   'event_date,truck_name,venue_name' })`. 🔴 **The payload has no `venue_id`, no `discovery_truck_id`, no
   visibility flags** — nine columns only.

### Writer B — the truck scraper, Pass B (same file, HatchGrab loop), 86 rows

1. Extracts a schedule, hashes it to skip unchanged pages.
2. 🔴 **No dedup step of any kind.** `existingEvents` is not consulted; the Sheet is not read or written.
3. POSTs to `/api/inbound-schedule` with `source: hg_scraper:<rule>`, and now asserts the HTTP status.

### Writer C — the Google Apps Script (`docs/apps-script/village-foodie-v6.57.js`), 66 rows

1. Extracts from Drive screenshots or vendor emails, appends rows to the Sheet.
2. `mirrorEventsToSupabase` POSTs the nine event columns to `/api/inbound-schedule`.
3. **Separately**, on a time trigger, `removeDuplicateEvents` cleans the **Sheet** — see §3.
   🔴 **It never deletes from the database.** Neither do the other three `deleteRow` sites.

### Writer D — the admin screenshot upload (`app/api/admin/screenshot-events/route.ts`), 8 rows

1. Gemini extracts events from the uploaded image.
2. `filterScreenshotEvents` drops rows with no truck name, no date, an invalid venue name, or a truck
   matching an exclusion term. 🔴 **There is no duplicate check in this filter — none.**
3. POSTs to `/api/inbound-schedule`, deliberately rather than writing directly, so the venue matcher runs.

### The shared writing desk — `/api/inbound-schedule` (B, C and D all end here)

1. Refuses without the shared secret (401).
2. Maps each event, converts `DD/MM/YYYY` → ISO, drops rows with no date or no truck.
3. Loads all `discovery_trucks` and all `venues` once. Resolves the venue with `findVenue`
   (`lib/venue-matcher.ts`) and the truck by containment on `normName`.
4. **Upserts** on `event_date,truck_name,venue_name` with `ignoreDuplicates: false` — i.e. an existing key
   is **overwritten** (times, notes, `venue_id`, flags).
5. Bridges matching rows into `truck_events` for linked HatchGrab trucks, where a *separate* dedup and a
   reject-memory (`rejected_event_signatures`) do exist — **that protection is on `truck_events` only, not
   on `discovery_events`.**

### 🔴 Where the writers differ — the table that matters

| Check | A (scraper direct) | B (Pass B) | C (Apps Script) | D (admin upload) |
|---|---|---|---|---|
| Fuzzy event dedup before writing | ✅ (against the **Sheet**) | ❌ | ❌ | ❌ |
| Sheet-side duplicate cleanup afterwards | ❌ | ❌ | ✅ (**Sheet only**) | ❌ |
| Venue matched (`venue_id` set) | ❌ | ✅ | ✅ | ✅ |
| Truck id resolved | ❌ | ✅ | ✅ | ✅ |
| Unique key at insert | ✅ | ✅ | ✅ | ✅ |
| Existing row on key conflict | overwritten | overwritten | overwritten | overwritten |

## 2. Venue creation and matching

**Creation.** One site in the whole repository: the `venues` upsert inside the scraper's geocode block. Its
key is **`onConflict: 'name,village'` with `ignoreDuplicates: true`** (= *do nothing* on conflict). A venue
is created only when the scraper's own matcher returned nothing, and only if a village is present — a row
with no village is refused outright, because a NULL in a unique key never conflicts and would duplicate
forever. **The Apps Script creates venues in the Sheet only; nothing carries them to the database.**

**Matching, version 1 — the scraper's own (`resolveVenueFrom`).** Postcode first: if the event text contains
a postcode and venues share it, score those (`isFuzzyMatch` +100, substring +5) and take the best. Otherwise
scored fuzzy: fuzzy name +100; substring +10, then **+50 if the venue's village appears in the event text,
−20 if it does not**; −5 for a big length difference. Highest score above zero wins.

**Matching, version 2 — the app's (`findVenue` in `lib/venue-matcher.ts`).** Candidates by **token
containment** in either direction (stopwords like *the, inn, arms* dropped), then village agreement
(bidirectional token subset, plus an embedded-town fallback), then `applyDistanceCeiling` — a 15 km limit
measured from the median position of other venues in that village — then a deterministic `pickBest`
tie-break. It returns a confidence, and **never creates anything.**

🔴 **These two answer the same question differently.** The manual's own examples: `bell`/`bellinn` matches
under one rule and not the other; `pizzamondo`/`pizzamundo` the reverse.

### How foodPark reached ten rows

| id | name | village | postcode | coords | events |
|---|---|---|---|---|---|
| `1a87cc8c` | `foodPark` | Cambridge | CB2 0AA | 52.1751, 0.1415 | 8 |
| `de22d722` | `FoodPark CB1` | Cambridge | CB1 2GA | 52.1947, 0.1360 | 8 |
| `f4c1c940` | `FoodPark Biomedical` | Cambridge | **CB2 0AA** | 52.1740, 0.1342 | 4 |
| `ea19437c` | `foodPark at The Green & The Gardens between Royal Papworth Hospital and AstraZeneca's DISC on the Cambridge Biomedical Campus CB2 0AA` | Cambridge | CB2 0BB | 52.1737, 0.1343 | 3 |
| `4774ff5a` | `FoodPark at Eddington` | Cambridge | CB3 1BL | 52.2187, 0.0880 | 1 |
| `59b038de` | `foodPark Cambridge North` | Cambridge | — | 52.2249, 0.1572 | 1 |
| `068015f5` | `FoodPark Genome Campus` | Hinxton | CB10 1SA | 52.0835, 0.1856 | 1 |
| `b2ad5244` | `foodPark West Cambridge` | Cambridge | CB3 0FZ | 52.2098, 0.0913 | 0 |
| `b602a457` | `FoodPark Science Park` | Cambridge | CB4 0WN | 52.2332, 0.1411 | 0 |
| `09311ba0` | `foodPark Biomedical Campus` | **Langley** | CB11 4SB | 51.9907, 0.0911 | 0 |

**How they got in, despite the matching:**

- **The key cannot see them as the same.** `(name, village)` is exact text. Ten distinct names in
  "Cambridge" are ten distinct keys. **`f4c1c940` and `1a87cc8c` share postcode CB2 0AA** and are 1.8 km
  apart; `ea19437c` is ~100 m from `f4c1c940`. **Nothing in the creation path compares postcodes,
  coordinates or distance** — only the two strings.
- **The scraper's matcher rejects them as different names.** `normalizeName("FoodPark Biomedical")` and
  `normalizeName("foodPark")` differ by far more than one edit, so `isFuzzyMatch` says no. The
  substring branch would say yes — but it then applies the village test, and where the village token is
  absent from the event text it subtracts 20, which can push the score to zero.
- **`09311ba0` shows a second failure:** a Biomedical Campus row filed under **Langley**, 25 km from the
  Cambridge one. Whatever village the event carried at creation time is the village it got, permanently.
- **The one thing the key *does* catch** is an exact repeat, which is why re-runs do not multiply them
  further. Note also that `ignoreDuplicates: true` means **a venue's coordinates are never corrected by a
  later run.**

There is also a near-miss pair the key let through on a punctuation difference alone:
`Off The Beaten Truck, Wintringham` and `Off The Beaten Truck - Wintringham`, both **[St Neots]** — the same
name under any normalisation, two rows because the raw text differs by one character.

## 3. The dedup keys, per writer, and what each set is built FROM

| Writer | Conflict target at insert | On conflict | Pre-write dedup rule | **Built from** |
|---|---|---|---|---|
| A — scraper direct | `event_date, truck_name, venue_name` | **update** | date + 1-edit-fuzzy truck + 1-edit-fuzzy venue | 🔴 **the Google Sheet's Events tab**, plus rows added earlier in the same run |
| B — Pass B | same | **update** | none | — |
| C — Apps Script | same | **update** | none before writing | — |
| C — Apps Script, *afterwards* | — | — | date + **containment** truck + **containment** venue + village-equal-or-blank; also a time-overlap test that only **tags** `[⚠️ TIME CLASH]` | the **Sheet**, deleting from the **Sheet only** |
| D — admin upload | same | **update** | none (validity filters only) | — |

**Confirmed as you suspected:** the scraper's `existingEvents` is the Sheet's Events tab. Nothing in the
scraper builds a dedup set from `discovery_events`. A `DEDUP_FROM` switch is **named in a comment as
planned** alongside the three that exist (`SITES_FROM`, `MATCH_FROM`, `EXCLUSIONS_FROM`) but **is not
implemented** — I grepped for it and found only the comment.

⚠️ **The Sheet is a pruned view; the database is the unpruned ledger.** Past rows are deleted from the Sheet
on a trigger and never from the database. So the dedup window is effectively "future events the Sheet still
holds", and it is defined by a pruner outside this repository.

## 4. The worked case

**Your Azahar pair is not in the table today** (see the note in Part One). The live equivalent, used as the
positive control because my rule must be shown catching a case that is really there:

> **Eat Greek · 2026-09-09 · 17:00 · Northstowe**
> Row 1 — venue `Off The Beaten Truck - Northstowe`, source `URL: offthebeatentruck.co.uk`, **writer A**
> Row 2 — venue `Northstowe`, source `Drive Screenshot`, **writer C**

**Row 1's journey.** Writer A found it on the Off The Beaten Truck venue page. Because that site is a
*venue* page, the scraper stamps the venue as the site's own name — `finalVenue = site.name` — so the venue
string is `Off The Beaten Truck - Northstowe` whatever the page said. It then ran its fuzzy dedup against
the **Sheet**: nothing there matched, because row 2 came from a writer that never appends to the Sheet. It
was appended and mirrored with key `(2026-09-09, Eat Greek, Off The Beaten Truck - Northstowe)`.

**Row 2's journey.** Writer C read a screenshot, produced venue `Northstowe`, and POSTed to
`/api/inbound-schedule`. **That route has no event dedup at all** beyond the unique key. Its key was
`(2026-09-09, Eat Greek, Northstowe)` — different on the third field, so no conflict, so a second row.

**Which checks could have caught it, and why none did:**

| Check | Would it have caught it? |
|---|---|
| The unique key | ❌ `Off The Beaten Truck - Northstowe` ≠ `Northstowe` |
| The scraper's fuzzy rule | ❌ Never ran on row 2; and row 2 is not in the Sheet the rule reads |
| `findVenue` | ❌ It resolves a `venue_id`; **it is never consulted about whether the event is new** |
| The Apps Script's containment cleaner | ❌ Runs on the Sheet, deletes from the Sheet; row 1 is not in its Sheet view either way |
| A time comparison | ❌ **No writer compares times when deciding whether an event is new** |
| A village comparison | ❌ Both say Northstowe; nothing compares it at insert |

**The same pattern in your Azahar case:** `Azahar` vs `Azahar Artisan Spanish Food` differs on the truck
name too — so the key differed on **two** of its three fields, and the scraper's one-edit fuzzy rule would
have rejected the pairing even if both rows had been on the Sheet, because those two names are many edits
apart.

## 5. The scale — my rules stated, both counts, and the pairs

**My rules, so you can judge them.** Both compare rows on the **same date** and require the two rows to
name a **different venue** (different `venue_name` **or** different `venue_id`).

- **STRICT** — truck names identical after stripping non-alphanumerics; villages identical the same way;
  **start times exactly equal**.
- **LOOSE** — truck names identical **or one contains the other**; villages identical **or either is blank**;
  times **overlap**, where a missing start time counts as "cannot rule it out" and a missing end time is
  treated as start + 3 hours.

**STRICT: 43 pairs. LOOSE: 63 pairs.** (LOOSE-only adds 20.)

⚠️ Where each is likely wrong: STRICT will **miss** the very common 15-minute offset (`Between Buns` at
16:00 and 16:15) and every truck-name variant. LOOSE will **over-count** where a truck genuinely does two
pitches in one day — `Nomadough` on 11 September appears at The Bull [Langley], foodPark Biomedical and
Langley Lower Green, and at least one of those is probably real, not a duplicate.

### Worst offenders (loose pairs, by truck)

| pairs | truck |
|---|---|
| **19** | Pizzeria Gusto |
| **16** | Test Kitchen |
| 7 | Pig-Casso's |
| 6 | Nomadough |
| 3 | Pizza Mondo · Between Buns Royston |
| 2 | Between Buns · The Forge Kitchen · Pigs In |
| 1 | Marky D's · Tikka Tonic · Elder Street Food |

### A representative sample of the pairs themselves

| date | truck | row A | row B |
|---|---|---|---|
| 2026-09-09 | **Eat Greek** [Northstowe] | 17:00 `Off The Beaten Truck - Northstowe` (URL) | 17:00 `Northstowe` (Drive Screenshot) |
| 2026-09-10 | Nomadough [Saffron Walden] | 17:00 `Saffron Walden (The Common)` — no venue_id | 17:00 `Off The Beaten Truck - The Common` — vid `1c44311e` |
| 2026-09-10 | Pizza Mondo [Saffron Walden] | 17:00 `The Common` — no venue_id | 17:00 `Off The Beaten Truck - The Common` — vid `1c44311e` |
| 2026-09-11 | Pizza Mondo [Cambridge] | 12:00 `foodPark` — no venue_id | 12:00 `FoodPark CB1` — vid `de22d722` |
| 2026-09-11 | Pig-Casso's [Cambridge] | 12:00 `FoodPark Biomedical` — vid `f4c1c940` | 12:00 `Biomedical Campus Cambridge` — vid `ea19437c` |
| 2026-10-01 & 10-08 | Pig-Casso's [Cambridge] | 12:00 `foodPark` — vid `1a87cc8c` | 12:00 `Cambridge Science Park` — vid `71ab01f8` |
| 2026-09-12 | The Forge Kitchen [Felixstowe] | 18:00 `Wine-boutique, Felixstowe` (Drive) | 18:00 `Wine-Boutique` (URL) |
| 2026-08-30 | Pizzeria Gusto [Sudbury] | 11:00 `Sudbury Street Food Festival` (URL, Pass A) | 11:00 `Street Food Festival` (Pass B) |
| 2026-06-25 | Test Kitchen [Clare] | 17:00 `Platform One Café, Clare Castle Country Park` — vid `f49f4399` | 17:00 `Platform One Café` — vid `1f38ed3f` |
| 2026-09-09→13 | Between Buns / Between Buns Royston [Royston] | 16:15 / 12:15 `11 Kneesworth St` (URL) | 16:00 / 12:00 `11 Kneesworth St` (Admin Screenshot) |

### 🔴 The subset that proves the key is the wrong shape

**10 pairs point at the *same* `venue_id` under two different `venue_name` strings.** The database already
knows they are the same place, and the duplicate rule cannot use that fact:

| date | truck | both rows resolve to | but are stored as |
|---|---|---|---|
| 2026-08-30 | Test Kitchen | `2b4b3f54` | `Street Food Festival` / `Sudbury Street Food Festival` |
| 2026-09-18 | Pizzeria Gusto | `2cf14ec5` | `Wickhambrook MSC` / `MSC` |
| 2026-09-20 | The Forge Kitchen | `b0898490` | `Debenham` / `Debenham Vets` |
| 2026-08-17 | Test Kitchen | `2547cf9f` | `The Bell Inn` / `The Bell` |

## 6. What each rule cannot detect — one line each

| Rule | Blind spot |
|---|---|
| The unique key `(event_date, truck_name, venue_name)` | Any difference of a single character in either name, and every difference in time, village, coordinates or `venue_id`. |
| The scraper's fuzzy dedup (`isFuzzyMatch` ×2 + exact date) | Anything not in the Google Sheet — which is every row written by the other three writers, and every row the Sheet's pruner has removed. |
| `isFuzzyMatch` itself (≤1 edit) | Any name that differs by more than one character — a suffix like "Royston", a "The", an added descriptor. |
| `normalizeName` (the scraper's normaliser) | It strips `street`, `st`, `the`, `food`, `ltd`, `co` — so "The Street" normalises to nothing and can match anything else that does. |
| The Apps Script's `removeDuplicateEvents` (containment) | The database entirely — it deletes from the Sheet only; and rows whose villages differ but are both non-blank. |
| Its `[⚠️ TIME CLASH]` tag | It only writes a note in a Sheet cell; nothing reads it, and it never removes or prevents anything. |
| `findVenue` | It is never asked whether an *event* is new — it answers a different question, and its confidence is not even stored on `discovery_events`. |
| The venue key `(name, village)` | Two spellings of one pitch; the same pitch under two villages; identical postcodes; identical coordinates; anything about distance. |
| `ignoreDuplicates: true` on venues | An existing venue is never updated, so a wrong coordinate is permanent. |
| `resolveVenueFrom` (scraper venue matcher) | It only ever consults venues it can see in whichever source `MATCH_FROM` selects, and it has no distance ceiling at all. |
| The `truck_events` bridge dedup + `rejected_event_signatures` | It protects `truck_events` only; nothing it knows is applied to `discovery_events`. |

## 7. Where the same logic exists more than once

| Logic | Copies | Do they agree? |
|---|---|---|
| **`normalizeName` / `normalizeTruckKey`** | scraper + Apps Script | ✅ **Yes** — the manual verified them character-by-character over 3,536 real strings, 0 differences. The only divergence is a `String()` guard on the Apps Script side. |
| **`isFuzzyMatch`** | scraper (≤1 edit) + Apps Script (containment) | 🔴 **No — same name, different rule.** Containment matches `bell`/`bellinn`; the edit rule does not. The Apps Script's looser rule is the one attached to a **destructive** path (its retro-delete). |
| **Venue matching** | `resolveVenueFrom` (scraper) + `findVenue` (app) | 🔴 **No.** Different candidate rules, different tie-breaks; only `findVenue` has a distance ceiling and a confidence. |
| **The event dedup rule** | scraper (fuzzy, pre-write) + Apps Script (containment, post-write, Sheet-only) + the unique key (exact, at insert) | 🔴 **Three different rules on three different data sets** — nothing reconciles them. |
| **`venuesFuzzyMatch`** (`lib/venue-signature.ts`) | documented as a byte-mirror of the **scraper's** rule | Mirrors one of the two; the Apps Script's rule has no mirror anywhere. |
| **The `discovery_events` upsert** | scraper mirror + `/api/inbound-schedule` | Same key; **different payloads** — the route sets `venue_id`, `discovery_truck_id` and visibility flags, the mirror sets none of them. |

---

# HOW I CHECKED, AND WHAT I COULD NOT

**Measured (executed against the live database, all counts asserted against `content-range`):** every figure
in Part Two; the 43/63 duplicate pairs and every pair listed; the ten foodPark rows with their postcodes,
coordinates and event counts; the venue name-collision group; the per-writer resolution table.

**Structural (read from the code, not executed):** every rule described in §1–§3 and §6–§7, read from
`scripts/run-scraper.js`, `app/api/inbound-schedule/route.ts`,
`app/api/admin/screenshot-events/route.ts`, `lib/admin/screenshot-events.ts`, `lib/venue-matcher.ts` and
`docs/apps-script/village-foodie-v6.57.js`.

**Reasoned only:** which of the 63 loose pairs are genuinely duplicates rather than a truck doing two pitches
in a day; and that your Azahar row was deleted rather than never existing.

**Not established:** whether the unique index physically exists (see correction 4); and what the Sheet
currently holds — I cannot open it, so the scraper's dedup set is uncountable from here, exactly as the
manual says.

**⚠️ On grep method, since the brief asks:** no search here was scoped by file extension — the scraper is
JavaScript, the app is TypeScript and the Apps Script is a `.js` file inside `docs/`, so an extension filter
would have hidden a writer. **I distinguished "found nothing" from "errored" by echoing `$?` after each
search**: a grep that finds nothing exits 1 and prints nothing; a grep that errors prints to stderr and
exits 2. Every "no hits" claim above came from an exit status I read, not from an empty screen.
