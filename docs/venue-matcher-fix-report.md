# Venue Matcher Fix & Re-Emission

**7 September 2026 · one app file changed · nothing applied, nothing committed, nothing deployed**

**Marking.** 🔎 source-read · 🧪 executed. Every database call was a `select`. **No venue or event row was created, updated or deleted. No SQL was applied. The scraper was not run.**

---

## 🔴 TWO CORRECTIONS BEFORE ANYTHING ELSE

**1. The defect is at line 81, not line 88.** My previous report said 88 and this prompt carried that forward. 🧪 Line 88 was `const cvT = toks(c.village)` — a line *inside* the ≥2-candidate village filter, i.e. part of the check that works. The defect was:

```ts
81:  if (cands.length === 1) return { venue: cands[0], confidence: 'high' }
```

The substance of the finding was right; the line number was wrong, and a wrong line number in a fix report is how the wrong line gets edited.

**2. The "43 Village Halls collapsing onto Troston" was never a high-confidence problem.** 🧪 Measured: of the 42 non-Troston village-hall villages, **0 landed on Troston at high confidence — before the fix as well as after.** They were already `low`, so they were already excluded from the emitted SQL. The line-81 defect accounts for the three **high**-confidence mislinks (*The White Swan*, *Wine-Boutique*, *Busy*); the Village Hall collapse is a separate, low-confidence phenomenon. 🔴 **My test caught this by failing, and I had asserted the wrong expectation** — the legitimate query `"Village Hall" [Troston]` *should* be high, because that venue really is in Troston.

**Tree premise flagged:** the prompt states 24 modified / 78 untracked. 🧪 The tree was **25 modified / 81 untracked** at the start of this task and is **26 / 81** now — the drift is entirely my own prior work (`components/dashboard/types.ts`, `scripts/geo-validate.js`, and three reports), not an unknown change. No workstream was disturbed.

---

# TASK 1 — EVERY CALLER

🧪 Searched all extensions, no `--include` filter, from the repo root excluding `node_modules/`, `.next/`, `.git/`, `ios/`, `android/`, for `venue-matcher` · `findVenue` · `normName` · `toks(` · `VenueMatch`.

| Caller | File | Live? | Effect of the fix |
|---|---|---|---|
| 🔴 **`/api/inbound-schedule`** | `app/api/inbound-schedule/route.ts:76` | 🔴 **YES — production, on the hourly cron** | Confidence labels tighten; a wrong venue is now labelled `low` |
| **Backfill** | `scripts/backfill-venue-id.ts:73` | on demand | 110 links move from the `.sql` to the review CSV |
| **Low triage** | `scripts/backfill-venue-id-low.ts:75` | on demand | more rows to triage |
| **Re-resolve** | `scripts/reresolve-event-venues.ts:38` | on demand | 🎯 patches **only** `high` — so it becomes strictly **more** conservative |
| `normName` only (not `findVenue`) | `lib/allergen-card-match.ts:16` | live | 🟢 **unaffected** — `normName` and `toks` were not touched |

## 🔴 Yes, the live path uses it — so this has been producing bad links, and tomorrow's run improves

🔎 `scripts/run-scraper.js` does **not** import the matcher, but **Pass B POSTs to `/api/inbound-schedule`** (`run-scraper.js:1465`), and that route calls `findVenue` for every incoming row. It stamps `venue_id`, `latitude`, `longitude`, `postcode` and `venue_match_confidence` onto **`truck_events` — a trading truck's own schedule.**

**What changes for the cron:** once deployed, a lone token candidate in the wrong village is labelled `low` instead of `high`. ⚠️ **The coordinates are still stamped** — `inbound-schedule:227-232` writes `matchedVenue`'s coordinates regardless of confidence. The mitigation is the approval banner built in the previous task, which now fires on exactly these rows. **Making the live route refuse a low-confidence coordinate is a separate decision I have not taken.**

🧪 **Current blast radius is small:** `truck_events` with `source='scraper'` and a future date = **0**, and Pass B's last three runs were all `unchanged_text; healthy_skip`. The path is armed, not firing.

## Does any caller depend on the permissive behaviour? No — checked each

🔎 `reresolve-event-venues.ts:38` skips anything not `high` ("preserves the old *only touch confident matches* behaviour") → fewer high means it touches less. 🔎 `inbound-schedule` uses `matchedVenue` for coordinates and the dedup primary key **irrespective of confidence**, and the venue is still returned — only the label changes, so dedup is unaffected. 🔎 The two backfill scripts route on confidence into `.sql` vs `.csv`, which is the intended effect. **Nothing depended on it; nothing is changed underneath a caller.**

---

# TASK 2 — THE FIX

## 2.1 The confidence decision — quoted before and after

**BEFORE** (`lib/venue-matcher.ts:81`):
```ts
if (cands.length === 1) return { venue: cands[0], confidence: 'high' }
```

**AFTER** (`lib/venue-matcher.ts:188`):
```ts
if (cands.length === 1) {
  return applyDistanceCeiling(
    { venue: cands[0], confidence: villageAgrees(village, cands[0].village, venueName) ? 'high' : 'low' },
    village, allVenues,
  )
}
```

🔎 `villageAgrees()` is **not a new rule.** It is the two-part test the ≥2 branch already applied — bidirectional village-token subset, then the embedded-town fallback — hoisted into a named function so the single-candidate branch can call it. **The village now participates in the decision; it is not a tiebreak.**

🔴 **And the ≥2 branch is byte-for-byte unchanged.** An earlier draft of this fix replaced its two *stages* with one combined predicate. That is a different rule: staged, the embedded-town fallback runs only when village-token agreement yields nothing; combined, the two sets union and `agree.length` can grow from 1 to 2, flipping a legitimate `high` to `low`. **I caught this before proving anything and restored the branch verbatim** — the comment in the file records why.

## 2.2 The distance ceiling — 15 km, derived

The venue has coordinates. The event has a *village name*. To compare them without a network call or a new input, a village's position is taken from **the other venues already recorded in it** — the median, so one badly-geocoded row cannot drag the anchor. 🔎 This keeps `findVenue` a pure function of `allVenues`, memoised per array.

🧪 Measured over today's 600 unlinked future events, split by the existing village-token rule:

| Population | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| villages **AGREE** (known-good) | 320 | 0.16 km | 3.36 km | 4.04 km | **5.55 km** | 13.5 km |
| villages **DISAGREE** | 74 | **36.34 km** | 36.34 km | — | — | 185.8 km |

| Ceiling | genuine matches wrongly blocked | disagreements caught |
|---|---|---|
| 5 km | 10 | 73 / 74 |
| 8 km | 1 | 73 |
| 12 km | 1 | 71 |
| **15 km** | 🟢 **0** | **70 / 74** |
| 20 km | 0 | 69 |

**15 km is where false rejection reaches zero while nearly every disagreement is still caught** — a 2.7× margin over the known-good p99. It is not a round number chosen for comfort; at 12 km a real match is lost and at 20 km four more disagreements slip through with nothing gained.

**It is hard, not advisory, where an anchor exists**: over the ceiling downgrades `high` → `low`. It never rejects the venue outright, because the review CSV needs the row and the operator decides. 🧪 **No high link over the ceiling survives** (Task 4).

## 2.3 🔴 A missing coordinate is not a free pass

🔎 `applyDistanceCeiling` distinguishes three outcomes, deliberately not two:

| Case | Result |
|---|---|
| too far | downgrade to `low` |
| within the ceiling | **verdict unchanged** — it does *not* promote anything |
| **UNKNOWN** — venue has no coordinates, or no other venue in that village gives an anchor | **verdict unchanged** |

🔴 **Distance can only downgrade, never upgrade.** Absence of distance evidence is absence of evidence; the village rule is what earns `high`, and it has already run. A free pass would be "no anchor ⇒ high regardless of village" — which is precisely the bug being fixed.

🧪 This matters: **174 of the 600 events have no anchor**, and `"The White Swan" [Bluntisham]` is one of them. Distance cannot see it — **the village rule catches it instead.** Distance is the second net.

---

# TASK 3 — PROOF

🧪 Suite imports the real module by absolute path (sha256 printed at run time) and compares against a pre-edit copy of the same file, so every line is a genuine before/after.

## The named failures — all downgraded

| Query | BEFORE | AFTER |
|---|---|---|
| "The White Swan" [Bluntisham] | "The Swan" [Monks Eleigh] **high** | "The Swan" [Monks Eleigh] **low** ✅ |
| "Wine-Boutique" [Felixstowe] | [Sudbury] **high** | [Sudbury] **low** ✅ |
| "Busy" [West Runton] | [Norwich] **high** | [Norwich] **low** ✅ |
| "The Bull Pub" [Great Paxton] → [Saffron Walden], 36 km | low | low ✅ (already low; **42 events**) |

## The 43 Village Halls — corrected test

🧪 Of the 42 non-Troston village-hall villages, **0 reach Troston at high, before or after.** The legitimate `"Village Hall" [Troston]` correctly stays **high**. The three specific mislinks (Freethorpe, Little Thetford, Ridgewell) were `low` before and remain `low`.

## 🔴 Negative control — genuine matches still pass

| Query | Result |
|---|---|
| "The Fox" [Burwell] · "The Tharp Arms" [Chippenham] · "The Fox Inn" [Honington] | **high** ✅ |
| **"The Cavendish Five Bells" [Cavendish]** → "The Five Bells" — *legitimately fuzzy: embedded town, venue name ⊆ scraped* | **high** ✅ |
| **"Five Bells" [Cavendish]** → "The Five Bells" — *scraped name shorter than the venue* | **high** ✅ |
| "Nethergate Brewery" [Long Melford] | **high** ✅ |
| **"The Cavendish Five Bells" with village = null** — embedded-town fallback | **resolves** ✅ |

🧪 Whole-table control: every venue queried by its **own** name and village — **high before 528, after 515** of 528.

## The 13 self-lookups the ceiling downgrades — each independently verifiable as bad data

🧪 All 13 are venues sitting > 15 km from their own village's anchor, and the ceiling rediscovers them without knowing anything about the placeholder or sentinel rules:

`138.5 km The Swan Motel [Gillingham]` · `102.2/94.2 km Kirton Village Fete / Kirton Suffolk Day [Kirton]` · `30.9 km The Cap [Harleston]` · `30.3 km Village Green [Harleston]` · `27.9 km We Are Wintringham` · `18.9 km Old Brewery [Stansfield]` · `18.0 km Newnham [Cambridge]` · `16.4 km CAMBRIDGE-ARBURY` · `16.2 km Hobson Square [Trumpington]` · `16.0 km Honeywell House [Cambridge]` · `15.8 km Clay Farm [Trumpington]` · `15.3 km The Rose and Crown [Impington]`

🎯 The Cambridge/Trumpington rows are the **longitude sign-flip class** from the geocoder report, found again by a completely different mechanism. ⚠️ The two *Kirton* rows are a different story — Kirton exists in Suffolk **and** Lincolnshire, so the anchor itself is polluted; that is a limitation of anchoring on village name, recorded below.

## What each proof would look like if it were proving nothing

| Proof | Hollow signature | Why it is not |
|---|---|---|
| Named failures downgraded | a matcher that returns `low` for everything | 7 genuine matches, including two fuzzy ones, still return `high` |
| Village Hall test | asserting an expectation that is trivially true | 🔴 **it failed first**, and inspecting it showed *my assertion* was wrong, not the code |
| Self-lookup 528→515 | a collapse hidden by an averaged figure | all 13 downgrades are listed individually and each is independently bad data |
| Before/after comparison | testing a stale copy | the pre-edit copy is a byte copy taken before the first edit; the live module's sha256 is printed |
| Emission counts | the script silently writing to the database | `--apply` not passed; 🧪 pinnable count still 69 afterwards |

---

# TASK 4 — RE-EMISSION

🧪 `npx tsx scripts/backfill-venue-id.ts` (emit-only). **Artifacts preserved:** the 8 July files and the 3 pre-fix 7 September files are both in the session scratchpad (`backfill-output-JULY-BACKUP/`, `backfill-output-PREFIX-SEP7/`). The output directory is gitignored.

## The trade, sized

| | pre-fix | post-fix | change |
|---|---|---|---|
| **HIGH** (goes into the `.sql`) | 435 | **325** | 🔴 **−110** |
| **LOW** (review CSV only) | 133 | **243** | +110 |
| **NONE** | 32 | 32 | — |
| Events pinnable after applying | 504 / 669 (75%) | **394 / 669 (59%)** | −110 |

🔴 **110 events lose a proposed link — a 16-point drop in map coverage — and that is the correct trade**, because those 110 were being linked on token overlap with no village check. 🧪 Verified the three named mislinks are gone from the emitted SQL: `The White Swan` 1→**0**, `Wine-Boutique` 1→**0**, `Busy` 2→**0**; `UPDATE` statements 435 → **325**.

## Full low-confidence set — 35 distinct links, 243 events

| Distance | Ev | Event venue [village] | → Proposed [village] | Truck |
|---|---|---|---|---|
| 🔴 185.8 km | 1 | Dog Day Fairhaven [Unknown] | The Dog Inn [Horsford] | Marky D's |
| 🔴 42.8 km | 1 | Wine-Boutique [Felixstowe] | Wine-Boutique [Sudbury] | The Forge Kitchen |
| 🔴 36.6 km | 1 | Ridgewell Village Hall [Ridgewell] | Village Hall [Troston] | My Thai Chef |
| 🔴 **36.3 km** | **42** | The Bull Pub [Great Paxton] | The Bull Pub [Saffron Walden] | Perky Beans |
| 🔴 34.8 km | 1 | Busy [West Runton] | Busy [Norwich] | Marky D's |
| 🔴 34.5 km | 8 | The Bull [Bottisham] | The Bull [Lower Green] | Holy Loaded |
| 🔴 26.7 km | 9 | The Plough [Great Shelford] | The Plough [Birdbrook] | Gino's Pizza |
| 🔴 23.8 km | 6 | The Railway Tavern [Norwich] | The Railway Tavern [Dereham] | Zaket Potato |
| ⚠️ 16.5 km | 1 | Thelodgebar [Bury Saint Edmunds] | Thelodgebar [—] | Pigs In |
| ⚠️ 12.5 km | 1 | The Bull [Langley] | The Bull [Lower Green] | Nomadough |
| ⚠️ 11.7 km | 1 | foodPark [Milton] | foodPark [Cambridge] | Nomadough |
| ⚠️ 8.2 km | 1 | Dog show [Norfolk] | The Dog Inn [Horsford] | Marky D's |
| ✅ 2.8 km | 1 | Off The Beaten Truck - Wintringham [Wintringham] | …, Wintringham [St Neots] | Pig-Casso's |
| ✅ 0.5 km | 1 | Off The Beaten Truck [Saffron Walden] | … - The Common [Saffron Walden] | Nomadough |
| ❓ | 29 | Blackpit Brewery [Stow-Bridgwater] | Blackpit Brewery [Stowbridge] | Hot Dog Mafia |
| ❓ | 24 | Roughacre Brewery [RoughAcre] | Roughacre Brewery [Clare] | The Little Pizza Oven |
| ❓ | 24 | Church View Campsite [Church View] | Church View Campsite [Barrow] | Camp Out Takeaway |
| ❓ | 17 | The Street [Capel St. Mary] | The Street [Whatfield] | The Travelling Friar |
| ❓ | 9 | Barracks [Barracks] | Barracks [Sutton Heath] | White Gold |
| ❓ | 9 | Near the Co op Store [same] | Near the Co op Store [Laxfield] | White Gold |
| ❓ | 9 | Near the Spar Shop [same] | Near the Spar Shop [Stradbroke] | White Gold |
| ❓ | 8 | Near The King's Head Pub [same] | … [Tollesbury] | White Gold |
| ❓ | 8 | The Railway Inn Pub [same] | … [Framlingham] | White Gold |
| ❓ | 8 | Recreation Ground [same] | Recreation Ground [Bures] | White Gold |
| ❓ | 8 | Royal Square [Royal Square] | Royal Square [Dedham] | White Gold |
| ❓ | 6 | foodPark [CB1] | foodPark [Cambridge] | Pig-Casso's |
| ❓ | 1 each | The White Swan [Bluntisham] → The Swan [Monks Eleigh] · Little Thetford Village Hall → Village Hall [Troston] · freethorpe village hall ×2 → Village Hall [Troston] · The King's Head [Pebmarsh] → [Fen Ditton] · The Cross Keys [Henley] → [Hatfield Peverel] · Busy [Cantley] → [Norwich] · Mariners Arms Pop Up [Felthorpe] → [Norwich] · The Affleck Arms [—] → [Dalham] | | |

**9 links > 15 km · 1 > 48 km · 21 links (185 events) whose distance cannot be measured.**

🟢 The eleven **White Gold** and similar rows are the landmark-named pitches — *Barracks*, *Near the Co op Store*, *Near the Spar Shop*, *Recreation Ground*, *Royal Square*. Their "village" repeats the venue name so no anchor exists. **These are real pitches, not junk**, and their proposed venue is the same name in a named village — plausibly right, unverifiable without a postcode.

## Remaining HIGH links over the ceiling

🧪 **NONE.** The ceiling is hard wherever an anchor exists.
⚠️ **2 distinct high links (6 events) have no measurable distance**: `foodPark [Biomedical Campus Cambridge] → foodPark [Cambridge]` and `Ludham bridge [Great Yarmouth] → Ludham bridge [Ludham]`. Both are plausible; both are unverified.
🧪 The furthest **measured** high link is **13.5 km** — `Lingwood Village Hall [Norwich] → [Lingwood]`, a coarse village name for a real place, comfortably inside the ceiling.

## 🔴 No proposed link changes a pin for a trading truck — re-confirmed

🧪 Trading trucks (`is_customer && active && !excluded`): **`pizzeria-gusto`, `real-thai-food`**.
- 🔎 The backfill writes **`discovery_events.venue_id` only**; a trading truck's pin comes from **`truck_events`**, never touched.
- 🧪 Exactly **1** proposed link names a trading truck — `Pizzeria Gusto @ Nethergate Brewery → Nethergate Brewery [Long Melford]` — and its discovery shadow is `excluded=true`, so ✅ **it stays hidden**.
- 🧪 **538** of the proposed links would become visible Village Foodie pins.

---

# TASK 5 — WHAT TO RUN, IN ORDER

### 1. Review the low-confidence CSV *(you, now — no command)*
`scripts/backfill-output/review-low-confidence.csv`. The nine links over 15 km are the ones to rule on; the 42-event *Bull Pub* row is the single biggest decision.
**Visible after: nothing changes.**

### 2. Apply the re-emitted SQL by hand
`scripts/backfill-output/backfill-venue-id.sql` — 325 guarded `UPDATE`s, idempotent (`AND venue_id IS NULL`), reversible from the snapshot JSON.
🟢 **Visible after: the map goes from 69 to ~394 of 669 future events.** No deploy, no scrape — SQL only. **This is the step that puts events on the map today.**

### 3. Deploy the matcher fix — 🔴 required for the cron, not for step 2
🔎 The backfill runs locally and already uses the fixed matcher. **`/api/inbound-schedule` runs on Vercel and does not**, so until this deploys the hourly cron keeps labelling wrong-village matches `high`.
**Visible after: nothing immediately** — 0 future scraper `truck_events` exist. It is prevention.

**Does it drag the six-file `git add -p` set?** 🟢 **No.** `lib/venue-matcher.ts` is a **new** entry in the working tree and is not one of the six (`lib/custom-domain/copy.ts`, `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `app/landing/page.tsx`, `lib/plan-features.ts`, `lib/landing-table.ts`). It can be committed on its own with `git add lib/venue-matcher.ts`.
⚠️ **But note what does *not* ship with it:** the approval-card confidence banner lives in `app/manage/[token]/page.tsx`, which **is** in the six-file set and carries another workstream's changes. Shipping the matcher alone means more events labelled `low` with no operator-facing indication — acceptable today only because there are 0 future scraper `truck_events`.

### 4. Deploy the geocoder + validation work, then let venue creation run
Stops new fabricated coordinates. **Visible after: nothing today**; new venues stop being born wrong.

### 5. Correct the 40 bad venues *(not built)*
🎯 The ceiling gives you a second, independent list — the 13 self-lookup downgrades above. **Visible after: 2 currently-wrong live pins corrected.**

### 🔴 The standing gap, unchanged
🔎 Pass A still writes `venue_id: null`, so **step 2 must be re-run after every scrape** until Pass A calls `findVenue` at write time. Not built, not in scope.

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. 🧪 `npx tsc --noEmit` → **exit 0**.

**App files changed:** `lib/venue-matcher.ts` (+121 / −3) — **the only file edited in this task**.
**Scraper-project files changed:** **none.**
**Six-file `git add -p` set:** 🟢 **unchanged and not added to** — all six remain modified exactly as before.

Tree is **26 modified / 81 untracked** (25/81 at the start of this task, plus `lib/venue-matcher.ts`; this report overwrites an existing filename). Every other uncommitted workstream is untouched. **No SQL applied; no row created, updated or deleted.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **21 of the 35 low-confidence links (185 events) have no measurable distance**, because their "village" is a landmark phrase (*Barracks*, *Near the Co op Store*) or a fragment (*CB1*, *RoughAcre*) that no other venue shares. Their risk is **unknown, not zero** — and the largest blocks in the CSV are in this group.
- 🔴 **2 high links (6 events) are likewise unmeasurable** and ship in the SQL unverified.
- ⚠️ **The anchor inherits the table's own errors.** It is the median of venues already recorded in a village, so a village whose venues are badly geocoded has a bad anchor. 🧪 *Kirton* is the clear case — two venues 94 km and 102 km from their shared anchor because Kirton exists in both Suffolk and Lincolnshire. The median mitigates a single bad row, not a systematically split village.
- ⚠️ **15 km was derived from today's 600 unlinked future events.** It is fitted to the current data and should be re-derived if the venue table's geography changes materially.
- ⚠️ **Whether `inbound-schedule` should refuse to stamp coordinates from a `low` match** — the live route still stamps them. That is a behaviour decision I did not take, and the approval banner is the only thing standing between a low-confidence coordinate and a trading truck's public pin.
- ⚠️ **The fixed matcher has never run in production** — only locally, against production data, read-only.
- 🔴 **Whether the emitted SQL is correct for the 21 unmeasurable links** cannot be settled from this repository; it needs the postcodes the Sheet may hold, which I cannot read.
