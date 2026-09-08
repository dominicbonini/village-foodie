# What the postcodes in `ai_notes` are worth

**8 September 2026 · READ-ONLY MEASUREMENT.** No database row inserted, updated or deleted. No file changed except this report. Nothing staged, committed, pushed; `git add` not run in any form. **No code proposed, no job designed, nothing applied.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 15:03:52Z | END 15:06:43Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

🧪 **Confirmed: nothing reads `ai_notes` for logic.** All five occurrences outside docs are writes — `run-scraper.js:988-992, :1020, :1718`, `app/api/inbound-schedule/route.ts:60` (a pass-through), `scripts/migrate-from-sheets.cjs:141` — plus the column definition at `20260522_discovery_schema.sql:78`.

---

# 🔴 THE HEADLINE

**The postcode is the best positional evidence in this database, and it is better than both the matcher and the radius rule on the cases that matter.**

🧪 **It gets both known failures right, where `findVenue` gets both wrong:**

| case | `findVenue` | the postcode |
|---|---|---|
| Pizza Mondo @ `foodPark`, June | generic `foodPark`, **HIGH**, 6.55 km from the truth | `CB4 0WN` → nearest venue **`FoodPark Science Park`, 0.12 km** ✅ |
| `Great Wilbraham` / `Gt Wilbraham` | `Great Wilbraham`, **HIGH**, 2.56 km wrong | `CB21 5JQ` → **0.02 km from `Gt Wilbraham`** ✅ |

🧪 **And it catches all four of V1.1's named mislinks, where the radius rule caught two:**

```
The White Swan [Bluntisham] → The Swan [Monks Eleigh]     65.4 km  🟢 caught
Wine-Boutique  [Felixstowe] → [Sudbury]                    43.4 km  🟢 caught
Busy           [West Runton]→ [Norwich]                    34.5 km  🟢 caught
Village Hall   [Troston] ← Newton Flotman / Little Thetford / Southery
                                                    40.6 / 36.8 / 35.6 km  🟢 all caught
```

🔴 **And it finds damage nothing else could.** 🧪 `Worlington Beer Festival` carries village **`Workington`** and a stored coordinate in **Cumbria** — its own postcode `IP28 8RU` puts it in West Suffolk, **370.8 km away**. My previous report flagged exactly this row as un-catchable by the coordinate gauntlet, because it has no postcode on the *venue* to be inconsistent with. **The postcode on the *event* catches it.**

**But the coverage is structural, not random, and the ceiling is low: 🔴 731 of 2,229 unlinked rows (32.8%) can be placed this way. 1,498 cannot.**

---

## 1. STEP 1 — WHAT IS ACTUALLY IN `ai_notes`

**Patterns used, stated so they can be judged:**

```
FULL         \b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b      outward + inward
OUTWARD-ONLY \b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?!\s*\d[A-Z]{2})    outward with NO inward following
```

🧪 Across all **4,300** rows:

| | rows | share | |
|---|---|---|---|
| **EMPTY / null** | **1,720** | 40.0% | |
| **FULL postcode** | **1,104** | 25.7% | ⚠️ the brief's 774 counts *unlinked* rows only |
| **OUTWARD-ONLY (partial)** | **45** | 1.0% | 🔴 **cannot be resolved to a point** |
| other text, no postcode | 1,431 | 33.3% | |

🔴 **Only 146 distinct full postcodes across those 1,104 rows.** Heavy repetition — the same pitches recur. **This is the number that caps everything downstream**, and it is the single most important figure in this report.

**10 rows the pattern matched, verbatim:**
```
[CB24 1AA]  "Off The Beaten Truck - Northstowe"  :: "[⚠️ NEW TRUCK] | THE GREEN, CB24 1AA"
[CM23 2SR]  "Bishop's Stortford Cricket Club"    :: "Cricketfield Lane, Bishop's Stortford, Hertfordshire CM23 2SR"
[CM22 6DG]  "The Crown Inn"                      :: "5 The Cross, Elsenham CM22 6DG"
[CM24 8HX]  "The Rose & Crown"                   :: "31 Bentfield Road, Stansted Mountfitchet CM24 8HX"
[CM6 2JE]   "The Stag"                           :: "Duck Street, Dunmow CM6 2JE"
[CB22 7PG]  "The Queens Head"                    :: "Fowlmere Road, Newton, Cambridge CB22 7PG\nPre-orders closed"
[CB4 0GQ]   "foodPark"                           :: "Unit 332, Milton Road, Cambridge, CB4 0GQ"
[CB10 1JH]  "Saffron Walden (The Common)"        :: "The Common, Saffron Walden CB10 1JH"
[CB24 1AA]  "Northstowe Food Truck Park"         :: "THE GREEN, CB24 1AA"
[CB24 1AA]  "Off The Beaten Truck - Northstowe"  :: "THE GREEN, CB24 1AA"
```

**10 rows it did NOT match — what is being missed:**
```
PARTIAL  "foodPark"                  :: "CB1 Station Road, Outside Cambridge station"
PARTIAL  "foodPark"                  :: "CB1 3/4 Station Square Cambridge train station."
PARTIAL  "foodPark"                  :: "CB1 Station Road, Outside Cambridge station"
PARTIAL  "foodPark"                  :: "CB1 3/4 Station Square Cambridge train station."
NO-PC    "Wattisfield Village Hall"  :: "Debuting on Saturday evening"
NO-PC    "The Royal Oak"             :: "[📱 Drive]"
NO-PC    "Off The Beaten Truck - Northstowe" :: "Spanish Bocatas & Patatas Locas"
NO-PC    "FoodPark CB1"              :: "Outside Cambridge station"
NO-PC    "Saffron Grange"            :: "Northstowe"
NO-PC    "Northstowe Food Truck Park" :: "Northstowe"
```

🔴 **The partials are all `foodPark`/`CB1`.** Every distinct outward-only value: `CB1, CB4, SG5, CB25, PE28, CB11, IP1`. **`CB1` is a whole district of Cambridge — it cannot place a pitch**, which is exactly V1.2's finding that 20 of 400 venue postcodes are unresolvable partials. **Same defect, different table.**

**What the non-postcode text actually is** (normalised, top shapes):
```
486 × "[📱 Drive]"          115 × "[⚠️ NEW VENUE]"       97 × "# Dereham Road, Norwich"
 39 × "[⚠️ TIME CLASH]"      33 × "opposite Starbucks"     29 × "Bonfire Night"
 23 × "#/# Station Square Cambridge train station."        14 × "Outside Cambridge station"
```

⚠️ **Much of the field is scraper marker text, not address data.** `[📱 Drive]`, `[⚠️ NEW VENUE]`, `[⚠️ TIME CLASH]` are stamped by the scraper itself (🔎 `:989-991`). **A third of the "other text" bucket was never going to contain a postcode.**

---

## 2. STEP 2 — RESOLUTION

🧪 All 146 distinct postcodes, through postcodes.io, unbounded:

```
resolved (live)                      : 144
did NOT resolve                      :   2  → CB10 3HQ, CB21 5BQ
   of those, TERMINATED but locatable:   1  → CB21 5BQ
   genuinely unresolvable            :   1  → CB10 3HQ
⇒ distinct usable postcodes          : 145
⇒ event rows placeable               : 1,054 of the 1,104 carrying one
```

🔴 **`CB10 3HQ` is the postcode the Off The Beaten Truck page publishes for "The Common, Ashdon Road, Saffron Walden".** It does not exist. 🧪 It accounts for the 50-row gap between 1,104 and 1,054 — **the source itself is publishing a bad postcode, and every event at that pitch inherits it.**

⚠️ **Terminated postcodes matter and I checked them separately** rather than counting them as failures: one of the two "invalid" codes is a real, retired postcode with coordinates. **Treating a terminated postcode as unresolvable would discard a locatable point.**

---

## 3. STEP 3 — 🔴 DOES THE POSTCODE AGREE WITH WHAT ALREADY EXISTS?

🧪 **982 events** carry a resolvable postcode **and** get a `findVenue` candidate. Distance from the resolved postcode to the matched venue's stored coordinate:

| | rows | share | |
|---|---|---|---|
| **≤ 0.5 km** | **451** | **45.9%** | ✅ the postcode **confirms** the match |
| 0.5–2 km | 201 | 20.5% | ⚠️ consistent; within normal venue/postcode offset |
| **2–5 km** | **270** | **27.5%** | 🔴 disagreement |
| **> 5 km** | **60** | **6.1%** | 🔴 serious disagreement |

🔴 **330 events (33.6%) disagree by more than 2 km**, collapsing to **47 distinct venue-name × target pairs.** The worst:

| distance | event | `findVenue` picked | postcode says |
|---|---|---|---|
| **370.8 km** | `Worlington Beer Festival` [Worlington] `IP28 8RU` | `…`[**Workington**] stored 54.65,−3.55 | 52.33,0.48 — **Manor, West Suffolk** |
| **255.9 km** | `Bailey Hills Estate` [Bishop's Stortford] `CM23 1JG` | `…`[Bailey Hills] stored 53.85,−1.84 | 51.89,0.14 — Bishop's Stortford North |
| **79.9 km** | `Audley End Enchanted Railway` `CB11 4JB` | `The Railway Inn Pub` [Framlingham] | Saffron Walden Audley, Uttlesford |
| **65.4 km** | `The White Swan` [Bluntisham] `PE28 3LD` | `The Swan` [Monks Eleigh] | Holywell-cum-Needingworth |
| **54.8 km** | `Histon and Impington Recreation…` `CB24 9LU` | `Recreation Ground` [Bures] | Histon & Impington |
| **43.4 km** | `Wine-Boutique` [Felixstowe] `IP11 7BL` | `Wine-Boutique` [Sudbury] | Eastern Felixstowe |
| **40.6 / 36.8 / 35.6 km** | Newton Flotman / Little Thetford / Southery village halls | all → `Village Hall` [**Troston**] | each its own parish |
| **34.5 km** | `Busy` [West Runton] `NR27 9QG` | `Busy` [Norwich] | Beeston Regis & The Runtons |

🔴 **Every one of V1.1's worked mislinks appears in that list, and the postcode is right in every case.**

### 3.1 The two known failures — the postcode gets both right

**1) Pizza Mondo @ `foodPark`** — 21 rows. 🧪 The postcode does not merely pass a plausibility test; **it names the branch:**

```
ai_notes "Unit 332, Cambridge Science Park, CB4 0WN"  → CB4 0WN → 52.2340,0.1423
   findVenue picked generic "foodPark"                → 6.55 km away
   nearest venues to the postcode: "FoodPark Science Park" 0.12 km | "Cambridge Science Park" 0.19 km

ai_notes "The Green & The Gardens between Royal Papworth…"  → CB2 0AA → 52.1745,0.1351
   nearest venues: "FoodPark Biomedical" 0.08 km | "foodPark at The Green & The Gardens…" 0.10 km
```

🔴 **The same truck at the same nominal venue name is at two different sites on different dates, and the postcode separates them while the name cannot.** This is the category-name problem — the one the guards had to refuse rather than solve — **solved by evidence already in the row.**

**2) `Great Wilbraham` / `Gt Wilbraham`** — 🧪 all 6 Wilbraham rows carry a full postcode:

```
ai_notes "Church St, Great Wilbraham, Cambridge CB21 5JQ"
CB21 5JQ → 52.194755, 0.264658
   "Gt Wilbraham"    stored 52.194653, 0.264976  → 0.02 km  ✅ the human's choice
   "Great Wilbraham" stored 52.2167,   0.2531    → 2.56 km  ← findVenue's choice, HIGH
```

🔴 **The venue row that *carries* `CB21 5JQ` is 2.56 km from it; the row that does not carry it sits on it.** The postcode is the outside witness that settles it, and it agrees with the hand judgement.

### 3.2 🔴 If a postcode came from the wrong part of the page — my test for it FAILED, and I am reporting that

**A postcode lifted from a header, a footer or a neighbouring listing resolves perfectly and places the event wrongly. That is the failure mode that would make all of the above worthless.**

**My proposed detector — does the postcode's admin ward/district share a token with the event's `village`? — does not work.** 🧪 Of 1,051 rows with both, **460 (43.8%) "disagree"** — but the examples show why that number is meaningless:

```
"Off The Beaten Truck - Northstowe" village=[Northstowe]     pc→ Longstanton, South Cambridgeshire
"The Stag"                          village=[Little Easton]  pc→ Thaxted & the Eastons, Uttlesford
"Off The Beaten Truck - Alconbury"  village=[Alconbury Weald] pc→ The Stukeleys, Huntingdonshire
```

🔴 **All three are correct.** Northstowe *is* in Longstanton ward; Little Easton *is* in "Thaxted & the Eastons". **Ward names are administrative and rarely share tokens with village names, so the test flags correct data at scale. I am not reporting 43.8% as a suspect rate — the detector is broken, not the data.**

**What did work is the three-way comparison in §3**, and it found at least one real case:

```
"Thirsty" [Cambridge]  pc=CB11 4RY → Clavering, Uttlesford — 24.1 km from a Cambridge venue
   the stored venue coordinate (52.214, 0.116) is correct for Cambridge
   ⇒ 🔴 here the POSTCODE is the wrong one, lifted from elsewhere on the page
```

⚠️ **So the direction of error is not always the same, and a postcode-first rule must not assume the postcode wins.** When postcode and stored coordinate disagree, **something is wrong and a third signal is needed to say which** — the event's village, the truck's other venues, or a human. 🧪 I found one clear instance in 47 distinct disagreement pairs; **I did not audit all 47, so the rate of wrong-postcode versus wrong-venue is UNMEASURED.**

---

## 4. STEP 4 — WHAT IT PLACES THAT NOTHING ELSE CAN

🧪 Of the **545 NO-MATCH rows** (where `findVenue` returns nothing at all):

```
NO-MATCH rows carrying a resolvable postcode : 72  (13.2%)
   distinct venue names among them           : 36
   distinct postcodes among them             : 32
```

Top: `Incleboro Fields Caravan and Motorhome Club Campsite` (14), `Kings Forest Car Park` (6), `Norfolk Broads Caravan and Motorhome Club Campsite` (6), `Bailey Hills Vineyard` (4), `Hop Fields` (3), `Rougham Estate Pumpkin Patch` (3), `The Norfolk Tank Museum` (2).

🔴 **These are 72 events at 36 real places that no matching heuristic can reach — no candidate exists — and a postcode lookup places every one to ~100 m.** ⚠️ And they are exactly the class V1.2 warns about: **a campsite, a car park, a vineyard, a pumpkin patch are real pitches with unusual names, not bad data.**

**Across the whole unlinked backlog:**

```
🔴 unlinked rows with a resolvable postcode: 731 of 2,229 (32.8%)
   distinct venue names: 145      distinct postcodes: 113
```

⚠️ **145 distinct venues is the real ceiling.** 731 rows sounds large; it is 145 places, most of them repeats.

---

## 5. STEP 5 — 🔴 WHAT THE POSTCODE CANNOT DO

**A postcode locates a POINT. It does not name a venue.**

🧪 **37 of the 145 usable postcodes (26%) carry more than one venue name, covering 534 of 1,054 rows (51%).**

```
CB4 0WN : "foodPark" · "FoodPark Science Park" · "Cambridge Science Park" · "Unit 332 Cambridge Science P"
PE19 0AW: "Wintringham" · "Off The Beaten Truck - Wintr" · "Wintringham Primary Academy" · "Off The Beaten Truck, Wintri"
PE28 4XA: "Off The Beaten Truck - Alcon" · "Alconbury Weald" · "Off The Beaten Truck" · "Co-op"
CB21 4XN: "Wylde Sky Brewery" · "Wylde Sky Taproom" · "Wylde Skye" · "Unit 8A, The Grip Industrial"
CB10 1JH: "Saffron Walden (The Common)" · "Off The Beaten Truck - The C" · "The Common"
CB24 9EP: "The King Bill" · "King Bill IV Pub, Histon" · "King Bill IV Pub"
```

⚠️ **Read carefully, this is mostly good news and I nearly reported it as bad.** Every group above is **one pitch under several names** — `Wylde Sky Brewery`/`Wylde Sky Taproom`/`Wylde Skye` is one place; `The King Bill`/`King Bill IV Pub` is one pub. 🔴 **A postcode would correctly unify them, which is precisely the venue-duplication problem the consolidation work is trying to solve by hand.**

🧪 **I did not find a clear case of two genuinely different pitches sharing a postcode in this data.** The Saffron Walden pair — the one case where two pitches are 0.9 km apart on one page — have **different** postcodes (`CB10 1JH` and `CB11 3HQ`), so the postcode separates them.

⚠️ **But the general limitation stands and is not disproved by this dataset:** a rural postcode can span a wide area, a large site can have one postcode and several pitches, and 51% of postcode-bearing rows sit on a code that already carries more than one name. **A postcode says where; it does not say which.**

---

## 6. STEP 6 — 🔴 PROVENANCE: THE COVERAGE IS STRUCTURAL

🧪 Postcode coverage by `source`:

| source | rows | FULL postcode | partial | empty |
|---|---|---|---|---|
| **`URL:`** (Pass A web scrape) | 2,952 | **1,100 (37%)** | 45 | 902 (31%) |
| `Manual Entry` | 589 | **0 (0%)** | 0 | 589 (100%) |
| `Drive Screenshot` | 511 | **0 (0%)** | 0 | 0 (0%) |
| `hatchesup_scraper` | 108 | **0 (0%)** | 0 | 108 (100%) |
| `hg_scraper` (Pass B) | 108 | **0 (0%)** | 0 | 108 (100%) |
| `Mobile Screenshot` | 9 | 0 | 0 | 0 |
| `Email Scheduler` | 6 | 0 | 0 | 0 |
| `Manual entry 2026-09` | 4 | 4 (100%) | 0 | 0 |

🔴 **1,100 of the 1,104 postcodes come from a single source: `URL:`. Every other path produces zero.**

⚠️ **This is structural, not random, and it changes what the approach is worth.** 🔎 The `URL:` path is the only one whose prompt asks for it — rule 7 at `run-scraper.js:731`: *"Postcodes, addresses, or extra event details go into the 'Notes' field."* 🔎 Pass B (`hg_scraper`) uses a different prompt at `:1598-1606` with no such rule; `Drive Screenshot` is an Apps Script outside the repo and writes `[📱 Drive]` marker text instead; `Manual Entry` rows are generated from Sheet-supplied rules with no page to read.

**Consequences, stated plainly:**
- A postcode-first approach **works only for Pass A web-scraped events**. 🧪 That is 2,952 of 4,300 rows (69%) of the corpus, but only 37% of those actually carry one.
- 🔴 **The 511 `Drive Screenshot` rows have 100% non-empty `ai_notes` and 0% postcodes.** The field is full of `[📱 Drive]`. **Coverage there is not low, it is structurally zero**, and no amount of better parsing will change it.
- ⚠️ **Coverage could be raised for `URL:` rows** — 902 of them have empty `ai_notes` despite the prompt asking for the address. **Whether the page had no postcode or the model dropped it is UNREAD.**

---

## 7. WHAT THIS CANNOT DO — AND WHAT WOULD DISPROVE THE ABOVE

- 🔴 **A postcode from the wrong part of a page resolves perfectly and places the event wrongly.** §3.2 — my ward-token detector does not work, I found one real instance by the distance test, and **the rate is unmeasured.**
- 🔴 **A postcode does not identify a pitch** where a site has several (§5).
- 🔴 **`CB10 3HQ` shows the source itself can publish an invalid postcode** — 50 rows inherit it.
- ⚠️ **Partials (`CB1`) place nothing** — 45 rows.
- ⚠️ **The 47 disagreement pairs were not individually adjudicated.** I have shown the postcode is right in the cases with independent corroboration (the two known failures, V1.1's four mislinks); **I have not proven it is right in all 330 disagreeing rows.**
- ⚠️ **145 distinct venues is the ceiling**, not 731 rows.

*If this whole report were proving nothing:* a postcode that always agreed with the matcher would tell us nothing new, and one that always disagreed would suggest my resolution was broken. 🧪 Neither holds — **45.9% agree within 500 m** (so the pipeline and the postcodes are talking about the same places), **33.6% disagree by >2 km**, and the disagreements are concentrated on cases independently known to be wrong. **That split is what makes the field informative rather than either redundant or broken.**

---

## 8. THE PLAIN NUMBERS

**Of the 2,229 unlinked `discovery_events` rows:**

| | rows | |
|---|---|---|
| 🟢 **could be placed by postcode alone** | **731** | **32.8%** — 145 distinct venues, 113 distinct postcodes |
| 🔴 **could not** | **1,498** | **67.2%** |

**Of the 1,498 that could not:** no postcode in `ai_notes` at all (the great majority), 45 carrying only an unresolvable partial, and 50 carrying the invalid `CB10 3HQ`.

⚠️ **And of the 731 that could, 51% sit on a postcode that already carries more than one venue name** — so a postcode places them, and in about half of those cases a second signal is still needed to name the pitch. **On this data those name-groups are overwhelmingly aliases of one place rather than distinct pitches, which makes them a unification opportunity rather than an ambiguity — but that is a property of this dataset, not a guarantee.**

---

## 9. STATE AT END

Counts END = START: `discovery_events` **4,300**, `venues` **559**, `discovery_trucks` **231**.

`git status --short`:

```
 M .gitignore
 M app/admin/page.tsx
 M app/api/cron/custom-domain-check/route.ts
 M app/api/manage/route.ts
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M app/o/[slug]/page.tsx
 M components/EventListCard.tsx
 M components/dashboard/CustomDomainSetup.tsx
 M components/dashboard/DemoWelcome.tsx
 M components/dashboard/types.ts
 M components/landing/LandingFooter.tsx
 M docs/manual-update-report.md
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/custom-domain/copy.ts
 M lib/custom-domain/dns.ts
 M lib/custom-host.ts
 M lib/landing-table.ts
 M lib/meta/webhook-signature.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M lib/venue-matcher.ts
 M lib/whatsapp/connection-state.ts
 M proxy.ts
 M public/badges/README.md
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/ai-notes-postcode-report.md
?? docs/android-golive-landing-report.md
?? docs/arbitration-validation-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
?? docs/exclusion-check-position-report.md
?? docs/exclusions-provenance-report.md
?? docs/geocoder-validation-report.md
?? docs/hatches-up-comparison-report.md
?? docs/hatches-up-import-report.md
?? docs/hatches-up-recheck-report.md
?? docs/hatches-up-reconciliation-report.md
?? docs/hatches-up-source-report.md
?? docs/hatchesup-events.csv
?? docs/hatchesup-online-ordering.csv
?? docs/hatchesup-online-ordering.md
?? docs/hatchesup-ordering.csv
?? docs/hatchesup-trucks-tagged.md
?? docs/hu-columns-build-report.md
?? docs/hu-columns-report.md
?? docs/hu-reconciliation-report.md
?? docs/linking-guards-report.md
?? docs/local-dev-host-report.md
?? docs/order-link-outage-report.md
?? docs/order-route-rename-report.md
?? docs/order-url-routes-report.md
?? docs/outreach-manual-dates-report.md
?? docs/outreach-modal-report.md
?? docs/outreach-modal-v2-report.md
?? docs/outreach-page-report.md
?? docs/outreach-phone-and-sort-report.md
?? docs/outreach-phone-column-report.md
?? docs/outreach-platform-edit-report.md
?? docs/outreach-tab-report.md
?? docs/outreach-ui-fixes-report.md
?? docs/pimp-my-fish-manual-events-report.md
?? docs/pimp-my-fish-source-report.md
?? docs/platform-detection-report.md
?? docs/pricing-suppression-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/saffron-walden-extraction-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-filter-fixes-report.md
?? docs/scroll-lazy-silence-report.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
?? docs/truck-radius-report.md
?? docs/trucklist.txt
?? docs/venue-consolidation-report.md
?? docs/venue-coords-and-run-log-report.md
?? docs/venue-creation-diagnosis-report.md
?? docs/venue-creation-fix-report.md
?? docs/venue-link-apply-report.md
?? docs/venue-linking-report.md
?? docs/venue-linking-scope-report.md
?? docs/venue-matcher-fix-report.md
?? docs/venue-pipeline-report.md
?? docs/vf-map-events-report.md
?? docs/whatsapp-connections-build-report.md
?? docs/whatsapp-connections-fk-fix-report.md
?? docs/whatsapp-embedded-signup-s4-s5-report.md
?? docs/whatsapp-embedded-signup-scope-report.md
?? docs/whatsapp-embedded-signup-v4-report.md
?? docs/whatsapp-extraction-report.md
?? docs/whatsapp-golive-build-report.md
?? docs/whatsapp-golive-copy-report.md
?? docs/whatsapp-golive-decision-report.md
?? docs/whatsapp-golive-heading-report.md
?? docs/whatsapp-threshold-report.md
?? docs/whatsapp-token-expiry-report.md
?? docs/whatsapp-token-issued-at-report.md
?? docs/whatsapp-v4-landed-report.md
?? lib/app-badges.ts
?? lib/clipboard.ts
?? lib/custom-domain/alert.ts
?? lib/custom-domain/check.ts
?? lib/outreach.ts
?? lib/whatsapp-hint.ts
?? lib/whatsapp/connection-read.ts
?? lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/token-crypto.ts
?? public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
?? scripts/geo-validate.js
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`. **No database row written, no file changed but this report, nothing staged, committed, pushed or added. No code proposed, no job designed.**
