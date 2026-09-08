# `scroll_lazy` and the silent trucks — Steak & Honour, run against the live page

**8 September 2026 · READ-ONLY DIAGNOSIS.** No file changed. No database row inserted, updated or deleted. Nothing staged, committed, pushed; `git add` not run in any form. Every DB call was a `select`; the Sheet was read with the `spreadsheets.readonly` scope; the pages fetched are public. **No fix is proposed.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 13:14:46Z | END 13:20:04Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 THE ANSWER

**Steak & Honour is scraped, `scroll_lazy` works perfectly on its page, and the extraction is flawless. The events are then thrown away by the exclusion filter, because the truck's own name is in the Sheet's Exclusions tab.**

🧪 `normalizeName("Steak & Honour")` = `"steakhonour"`. 🧪 The Exclusions tab contains the literal row **`Steak & Honour`**, which normalises to the identical string. 🔎 `scripts/run-scraper.js:850-855` then `continue`s past every one of its events:

```js
const normRawTruck = normalizeName(truckName);
const isExcluded = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
if (isExcluded) {
    console.log(`   🚫 Skipping excluded truck term: ${truckName}`);
    continue;
}
```

**Stage: FILTERING. Not fetch, not capture, not extraction — all three were run against the live page and all three succeed.**

🔴 **And it does not explain the 51.** 🧪 Of 57 currently-silent site-list trucks, **5** are self-excluded. The other **52 have at least three different causes**, and one of them is not a fault at all. §4.

---

## 1. IS IT IN THE SITE LIST? — YES, AND THE SHEET WAS READ

🧪 **Read live from the Sheet's Trucks tab, row 93:**

```
name          = "Steak & Honour"
[6]  Website  = http://www.steakandhonour.co.uk
[8]  Schedule = https://order.steakandhonour.co.uk/
[14] AI instr = "This is a Hatches Up ordering page. Scroll through the entire list and extract
                 every single date header (e.g., 'MAR 19') and location pair. Pay strict attention
                 to the 'Today' and 'Tomorrow' tags under those headers"   (215 chars)
[15] Strategy = "scroll_lazy"
[17] Aliases  = steak and honour, steak & honor
[19] Exclude? = ""   (empty)
```

🔎 `scripts/run-scraper.js:483-499` builds `sitesToScrape` from that row: `targetUrl = row[8] || row[6] || 'about:blank'`, and a row enters the list when `hasUrl || hasInstructions`. 🧪 **Both are true, so it enters, with `sourceType: 'truck'` and `strategy: 'scroll_lazy'`.**

⚠️ **The warning in the brief is confirmed as a real hazard but does not bite here:** the DB row and the Sheet row happen to agree on URL, strategy, instructions and aliases. 🧪 The Sheet's site list is **109 of 152** truck rows — matching V1.2's figure exactly.

⚠️ **Note the `Exclude?` column is empty.** 🧪 A repo-wide sweep confirms column `[19]` is **written** at `:894` and **never read** by the scraper — so the exclusion that kills this truck is not that column. It is the separate Exclusions tab. **Two different mechanisms with confusingly similar names.**

*If this proved nothing:* a name-match on "steak" in the Sheet could be a different truck, or a stale row the scraper skips. Ruled out — exactly one row matched, its URL is the one in `discovery_trucks`, and the `sitesToScrape` predicate was evaluated against that row's actual cells rather than assumed.

---

## 2. RUNNING THE STRATEGY AGAINST THE LIVE PAGE

Replicated exactly: 🔎 launch args `:596-600`, user agent `:630`, `page.goto(url, {timeout:30000, waitUntil:'networkidle2'})` `:632`, `sleep(5000)` `:636`, then `performModernScroll` `:272-289` byte-for-byte (150 px steps every 100 ms until `1.5 ×` scrollHeight or a 15 s cap, then `sleep(3000)`, then `document.body.innerText`).

### 2.1 Served HTML vs rendered — the page IS client-side, and it does not matter

🧪 `curl` with the scraper's user agent: **HTTP 200, 1,471 bytes, 2 `<script>` tags, and 14 characters of visible text — `"Steak & Honour"`.** Zero occurrences of `September`, `CB[0-9]`, or `Cambridge`.

🔴 **So the six events are rendered client-side and are absent from the served HTML.** A plain HTTP fetch would see nothing. **`scroll_lazy` uses a real browser, so it does not care** — and this is exactly the distinction the brief asked to be made explicit: *client-side rendering is not the cause here, because the strategy renders.*

### 2.2 🧪 THE ACTUAL CAPTURED TEXT — verbatim, 617 characters

This is `cleanText`, the string handed to the model:

```
SEPT
09
The Plough Shelford
Wednesday 9 September, 17:00 until 20:00
2 High St, Great Shelford, CB22 5EH
SEPT
10
foodPark, Cambridge Science Park
Thursday 10 September, 12:00 until 14:00
Unit 332, Cambridge Science Park Unit, CB4 0WN
Cambridge Wine Merchants
Thursday 10 September, 17:45 until 20:15
163 Cherry Hinton Road, CB1 7BX
SEPT
11
foodPark CB1
Friday 11 September, 12:00 until 14:00
foodPark, CB1 at 3/4 Station Square, CB1 2GB
The Boot Inn
Friday 11 September, 17:00 until 20:00
18 Brinkley Rd, Dullingham, CB8 9UW
SEPT
12
Northstowe
Saturday 12 September, 17:00 until 20:00
The Green, Northstowe, CB24 1AA.
```

🧪 `document.title` = `"Steak & Honour"`, rendered HTML **10,129 bytes**, no navigation error. ⚠️ One sub-resource returned **429**; the schedule rendered regardless.

🔴 **All six events, with day, date, times, venue and full postcode. `scroll_lazy` is not the problem on this page.**

### 2.3 🧪 What the model returns — the extraction is perfect

The real prompt was rebuilt from 🔎 `:711-745` (including the truck's own `ai_instructions`) and sent to the real model 🔎 `:522-525` (`gemini-2.5-flash-lite`, `temperature 0`, `responseMimeType: application/json`). It returned **valid JSON, 6 events, 0 exclusions**:

| DateStart | Time | Venue Name | Village | Notes |
|---|---|---|---|---|
| 09/09/2026 | 17:00–20:00 | The Plough | Great Shelford | 2 High St, Great Shelford, CB22 5EH |
| 10/09/2026 | 12:00–14:00 | foodPark, Cambridge Science Park | Cambridge | Unit 332, …, CB4 0WN |
| 10/09/2026 | 17:45–20:15 | Cambridge Wine Merchants | Cambridge | 163 Cherry Hinton Road, CB1 7BX |
| 11/09/2026 | 12:00–14:00 | foodPark CB1 | Cambridge | 3/4 Station Square, CB1 2GB |
| 11/09/2026 | 17:00–20:00 | The Boot Inn | Dullingham | 18 Brinkley Rd, CB8 9UW |
| 12/09/2026 | 17:00–20:00 | Northstowe | Northstowe | The Green, Northstowe, CB24 1AA. |

**Correct dates, correct `DD/MM/YYYY`, villages populated, postcodes in Notes as rule 7 requires. Nothing to fix at this stage.**

---

## 3. WHERE IT FAILS — THE FILTER, AND IT IS PROVEN

🔎 The order of operations after extraction, `scripts/run-scraper.js`:

| Line | Stage | Steak & Honour |
|---|---|---|
| `:840-846` | historical-date skip | ✅ passes — all six are future |
| **`:850-855`** | **fuzzy exclusion check** | 🔴 **`continue` — every event dropped** |
| `:858-863` | private-event filter | never reached |
| `:871` | `finalTruck = site.name` (truck pages) | never reached |
| `:988-992` | dedup | never reached |
| `:1689` / `:1708` | Sheet + DB write | never reached |

🧪 **The proof, by executing the real functions** (`normalizeName` `:55-64`, `isFuzzyMatch` `:67-86`, byte-copied):

```
Exclusions tab                       : 146 rows → 146 normalised terms
rows matching /steak|honour|honor/   : 1  →  ["Steak & Honour"]
normalizeName("Steak & Honour")      : "steakhonour"
excludedTerms entries that match     : 1  →  ["steakhonour"]
⇒ isExcluded = true                  (run-scraper.js:851)
```

🔴 **It is an exact match, not a fuzzy near-miss** — the term and the truck name are the same string after normalisation. This would fire even if `isFuzzyMatch` were replaced with `===`.

🔴 **AND THE CHECK RUNS ON THE EXTRACTED NAME, BEFORE `finalTruck = site.name`.** 🔎 `:850` reads `normalizeName(truckName)`, where `truckName` is what the model returned; 🔎 `:871` only later replaces it with the site name for truck pages. So for a truck whose own page names it, **the exclusion set is being applied to the truck itself rather than to a non-truck listing on someone else's page** — which is what the set exists for (`live music`, `quiz nights`, `TBC`).

⚠️ **Why the term is there at all is UNREAD.** 🔎 `:786-794` shows the AI can propose `exclusionsToAdd` which are appended to the Exclusions tab, so it may be self-inflicted; it may equally be a hand entry. **The Sheet carries no provenance column and I did not guess.**

*If this proved nothing:* the truck could be absent from the site list (§1 rules that out), the page could be empty (§2.2 rules that out), or the extraction could fail (§2.3 rules that out). **Those three produce zero events too and mean different things — each was tested separately and each passed.** What remains is the filter, and it was not inferred: the exclusion set was read from the live Sheet and the match executed.

⚠️ **One thing I could NOT establish: whether the discovery pass actually reaches row 93 on a given run.** 🔎 V1.2 §"51 silent trucks" records that `discovery_run_log` is written but **the migration is not applied**, so "scraped and found nothing" is still indistinguishable from "never scraped". 🧪 What I can say is that the pass **is** running and writing — `URL:`-sourced rows were created at 2026-09-08T10:46Z. **So the pipeline runs; this truck's events are produced and then discarded.**

---

## 4. DOES THIS GENERALISE TO THE 51? — 🔴 NO. ONE INSTANCE, PLUS TWO OTHER CAUSES

🧪 **Measured over the whole site list:** 109 sites, **57 with zero future events**. Of those 57:

| | count |
|---|---|
| 🔴 **self-excluded (the Steak & Honour cause)** | **5** |
| everything else | **52** |

🧪 The five: **Axle & Hop, Dessert MK, Kerief, Steak & Honour, The Linton Kitchen.** (A sixth self-excluded truck, *The Noodle & Dumpling Bar*, is not silent.)

🔴 **So this is one instance generalised to five, not to fifty-one.** Three other silent `scroll_lazy` trucks were run through the identical path, and they fail at **different stages or not at all**:

| Truck | URL | 🧪 captured | 🧪 What the text actually is |
|---|---|---|---|
| **Between Buns** | betweenbunsroyston.hatchesup.app | **29 chars** | `"There are no upcoming events."` |
| **Burger Art** | burgerart.hatchesup.app | **29 chars** | `"There are no upcoming events."` |
| **A Taste of Jamrock** | facebook.com/profile.php?id=… | **2,272 chars** | a **logged-out login wall** |

### 4.1 🔴 The Hatches Up silent trucks are NOT A FAULT

🧪 Both render correctly and say, in the operator's own words, that there is nothing on. **The strategy worked, the extraction would correctly return zero events, and the database correctly holds none.** Counting these as scraper failures is a measurement error, not a bug.

### 4.2 🔴 The Facebook trucks ARE a real capture failure — and a different one

🧪 The captured text for A Taste of Jamrock, verbatim in part:

```
Log in
A Taste -Of Jamrock Ltd
228 followers • 49 following
More  Posts  About  Reels  Photos
Intro …  Page · Caterer · Caribbean restaurant
Ely, Cambridgeshire, United Kingdom …
A Taste -Of Jamrock Ltd
AI content · 3d ·  BURY ST EDMUND'S — WE'RE BACK!
Get r… See more
1  Like  Comment
Email address or phone number   Password   Log in
Forgotten password?  or  Create new account
Allow the use of cookies from Facebook on this browser? …
```

🔴 **2,272 characters of page furniture: a login form, a cookie consent dialog, and exactly one post truncated at "See more". No date, no venue, no schedule.** The model is being handed a cookie banner and asked for events; 🔎 prompt rule 12 (`:739`, PROXIMITY REQUIREMENT) then correctly refuses to invent any.

⚠️ **This is capture failure by anti-scraping, not a bug in `performModernScroll`** — the scroll ran, and there was nothing behind it to scroll to. 🧪 **33 of the 52 non-excluded silent trucks are `www.facebook.com`.** ⚠️ V1.2 already flags this as possibly unfixable; **this fetch is the first evidence that it is a logged-out wall rather than a layout change or a block**, and I tested one page, not thirty-three.

### 4.3 🔴 AND V1.2's HEADLINE CORRELATION IS WRONG

> V1.2 `:108`: *"100% OF FAILURES ARE `scroll_lazy`. EVERY `manual`, `click_next` AND `scrape_rules` TRUCK WORKS."*

🧪 **Contradicted.** Silent site-list trucks by strategy today:

```
scroll_lazy (blank default) : 43
scroll_lazy (explicit)      :  4
manual                      : 10     ← 🔴 not zero
```

**Ten `manual` trucks have zero future events.** ⚠️ `manual` trucks need no page fetch at all — 🔎 `:637-641` sets `cleanText = ""` and builds a rules prompt instead — **so whatever is silencing them cannot be a fetch or capture problem, and cannot be `scroll_lazy`.** The strategy correlation that drove the V1.2 diagnosis does not hold on today's data.

⚠️ **Base rates matter and I checked them:** 67 + 15 = 82 of 109 sites are `scroll_lazy`, so `scroll_lazy` dominating the failures is partly just it dominating the population. 🧪 **Failure rates: `scroll_lazy` 47/82 = 57%, `manual` 10/22 = 45%.** **Those are much closer than "100% vs 0%".**

### 4.4 Verdict on generalisation, stated plainly

🔴 **I have evidence of a common cause for 5 trucks, and evidence of at least two further, distinct causes.** The single label "51 silent `scroll_lazy` trucks" conflates:

1. **5** killed by the exclusion filter — proven, fixable, nothing to do with `scroll_lazy`;
2. **an unknown number** that genuinely have no events — **not a fault at all** (2 of 2 Hatches Up pages tested);
3. **~33** Facebook pages behind a logged-out wall — a real capture failure needing a different fix;
4. **10 `manual`** trucks that never fetch a page — **unexplained, and outside every hypothesis in V1.2**.

⚠️ **Three tested pages is not a census of 52.** The proportions in (2) and (3) are indicative.

---

## 5. THE PIMP MY FISH COMPARISON — 🔴 A DIFFERENT FAULT

🧪 `scroll_lazy` run against `order.pimp-my-fish.co.uk` **right now** captures **1,288 characters** containing all nine events with venues, times and postcodes — `Mandeville Hall Burwell`, `Great Shelford Memorial Hall`, `FoodPark CB1`, `Wylde Skye` and the rest.

🧪 **And Pimp My Fish is NOT in the exclusion set:** Sheet row 73, `normalizeName("Pimp My FIsh")` = `"pimpmyfish"`, **not present** among the 146 terms.

| | Steak & Honour | Pimp My Fish |
|---|---|---|
| In the site list | ✅ row 93 | ✅ row 73 |
| Strategy | `scroll_lazy` | `scroll_lazy` |
| Page type | Hatches Up on a custom domain | Hatches Up on a custom domain |
| 🧪 `scroll_lazy` capture | ✅ 617 chars, 6 events | ✅ 1,288 chars, 9 events |
| 🧪 Extraction | ✅ 6 events, valid JSON | ✅ proven working (V1.2) |
| 🔴 **In the exclusion set** | ✅ **YES — killed at `:851`** | ❌ **NO** |
| Currently producing rows | ❌ never, via `URL:` | ✅ yes, again |

🔴 **These are different faults.** Steak & Honour has a **specific, located, proven** cause: a filter that discards it after everything else has worked. Pimp My Fish has **no such blocker**, its whole path is demonstrably working, and V1.2 records its September stoppage as *cause unknown* — a description that remains accurate. **They share a strategy, a page vendor and a symptom, and nothing else.**

⚠️ **One difference worth recording rather than resolving:** 🧪 the Sheet lists PMF's URL as `…/basket/new`; I fetched the site root. Both render the same schedule component, but **the exact path the scraper uses was not the one I tested**, so any path-specific behaviour is UNREAD.

---

## 6. WHAT REMAINS UNREAD

- 🔴 **Why `Steak & Honour` is in the Exclusions tab.** No provenance column; 🔎 the AI-proposed `exclusionsToAdd` path at `:786-794` makes self-infliction possible but unproven.
- 🔴 **Whether row 93 is reached on a given production run.** `discovery_run_log`'s migration is still unapplied, so no run leaves per-site evidence.
- 🔴 **The 10 silent `manual` trucks** — outside every hypothesis in V1.2 and not investigated here.
- ⚠️ **32 of the 33 Facebook pages** were not fetched. One login wall is one login wall.
- ⚠️ **Whether a logged-in or cookie-accepted fetch would see the Facebook posts.** Not attempted.
- ⚠️ **The 429 responses** seen on all three Hatches Up fetches. Content rendered anyway; whether a full production run of 109 sites would be rate-limited harder is untested.
- ⚠️ **The other four self-excluded trucks** were identified by the same executed match but their pages were not fetched.

---

## 7. STATE AT END

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
?? docs/android-golive-landing-report.md
?? docs/arbitration-validation-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
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
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scroll-lazy-silence-report.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
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

**27 modified, 100 untracked, 0 staged** — identical to START except this report. `HEAD = 801de1c`, `origin/main = 08ac368`. **No file changed, no database row written, nothing staged, committed, pushed or added. No fix proposed.**
