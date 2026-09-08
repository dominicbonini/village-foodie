# Who writes the Exclusions tab — provenance, and whether this recurs

**8 September 2026 · READ-ONLY.** No file changed. No database row inserted, updated or deleted. **The Sheet was not modified** — every Google call used the `spreadsheets.readonly` scope. Nothing staged, committed, pushed; `git add` not run in any form. **No fix proposed.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 13:33:08Z | END 13:36:02Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |
| `excluded_terms` | **0** | **0** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 FIRST: THE BRIEF'S PREMISE HAS CHANGED SINCE IT WAS WRITTEN

🧪 **Read live at 13:34Z: the Exclusions tab now holds 143 data rows, not 146. `Steak & Honour`, `The Noodle & Dumpling Bar` and `Kerief` are all ABSENT** — no literal row, and **zero** rows that fuzzy-match any of them.

🧪 My own reading two hours earlier (`docs/scroll-lazy-silence-report.md`) recorded **146 rows including `Steak & Honour`**. **146 − 143 = 3, and the three missing are exactly the three named in the brief.**

⚠️ **I am not going to guess who removed them, but the removal itself is evidence for question 1: the tab is directly human-editable, and it was edited by hand within the last two hours.** Nothing in this repository deletes from that tab — 🧪 a sweep for `values.clear`, `batchUpdate`, `deleteDimension` and `values.update` across every extension returns no hits against it. **The only writer in the repo appends.**

**Everything below describes the tab as it stands now, and flags where the brief's figures no longer hold.**

---

## 1. EVERY WRITER TO THE EXCLUSIONS TAB

🧪 Repo-wide sweep, every extension, for `exclusion` / `excluded_terms` / `EXCLUSIONS`. **Exactly one writer to the Sheet tab exists in this repository.**

| # | Writer | Target | Trigger | Value written | Human approval? |
|---|---|---|---|---|---|
| **W1** | 🔎 `scripts/run-scraper.js:784-790` — `sheets.spreadsheets.values.append({ range: 'Exclusions!A:A' })` | 🔴 **the Sheet tab** | every discovery run, per site, whenever the model returns a non-empty `exclusionsToAdd` | 🔴 **the model's raw string, unmodified** — `resource: { values: [[ex]] }` | 🔴 **NONE** |
| W2 | 🔎 `scripts/run-scraper.js:792-794` — `supabase.from('excluded_terms').upsert({ term: ex })` | the DB table | same loop, immediately after W1 | same raw string | none — ⚠️ and it **always fails** (V1.2 §5.6: `truck_id` is NOT NULL, key is `(truck_id, term)`), which is why the table holds 0 rows |
| W3 | 🔎 `app/api/manage/route.ts:2167-2176` — `add_exclusion_term` | the DB table, **per `truck_id`** | operator clicks "delete with exclusion" in the schedule-import review UI (🔎 `app/manage/[token]/page.tsx:7569`) | 🔎 `normaliseExclusionTerm(ev.venue_name)` — the **venue** name | ✅ **yes — an operator clicks it** |
| W4 | 🔎 `scripts/migrate-from-sheets.cjs:157-170` | Sheet **→** DB, one-off | manual, last run 22 May 2026 | copies the tab | n/a — reads the tab, never writes it |

🔴 **W3 CANNOT REACH THE SHEET.** It writes `excluded_terms` scoped to a `truck_id`; 🔎 the scraper reads its set from the **Sheet** (`:453`, `exclusionData`) and never reads that table. **The operator-facing exclusion feature and the scraper's exclusion set share no state at all** — which is the same disjointness the brief notes for `discovery_trucks.excluded`, and it is a third independent mechanism.

### 1.1 What the model is asked to return — quoted

🔎 Both prompts carry the same task. Venue-page branch `:689`, truck-page branch `:719`:

> **TASK 2/3: Look for explicit mentions that something is NOT a food truck (e.g., 'Live Music', 'Quiz Night'). Extract those into 'exclusionsToAdd'.**

And the output contract, 🔎 `:704` and `:738`:

> `"exclusionsToAdd": ["Name of non-truck"]`

### 1.2 🔴 What validates a proposed term before it is written — NOTHING

🔎 `scripts/run-scraper.js:778-790`, the complete guard:

```js
if (exclusionsToAdd.length > 0) {
  for (const ex of exclusionsToAdd) {
      if (ex && typeof ex === 'string') {
          const cleanEx = normalizeName(ex);
          if (!Array.from(excludedTerms).some(existing => isFuzzyMatch(existing, cleanEx))) {
              await sheets.spreadsheets.values.append({ … values: [[ex]] });
```

**Three checks, and none of them is a validation:** non-empty, is-a-string, and not-already-present. 🔴 **There is no check that the proposed term is not a truck name** — not against `validTrucks` (built at `:455` and in scope), not against the site list, not against `discovery_trucks`. **A string the model returns is appended verbatim to the live exclusion set on the same run, and takes effect immediately** — 🔎 `:791` also does `excludedTerms.add(cleanEx)`, so it applies to the remaining sites in that very run.

🔴 **So the self-poisoning mechanism is real, unguarded, and will recur.** That is established from the executing lines and does not depend on knowing who added any particular row.

### 1.3 Writers outside this repo

⚠️ **The brief is right that a repo grep proves nothing about the tab.** What I can report:

🧪 The Sheet's **Logs** tab (the Apps Script's own log), read live: **506 rows spanning 2026-09-07 19:43 → 2026-09-08 14:33** — about 19 hours, and it rotates. **Zero rows mention "exclu".** Its nine distinct message shapes are:

```
Started processing Vendor Emails from Smart Inbox. · No new emails found with 'Process Schedule' label.
Started processing Google Drive screenshots. · No screenshots found in Drive folder. · Found file …
Auto-Created & Geocoded New Venue from Screenshot … · Mirrored # event(s) to Supabase.
Successfully extracted # events from Screenshot … File trashed · Finished processing Drive screenshots.
```

⚠️ **This is weak evidence and I am labelling it as such.** The log covers 19 hours out of months, it rotates, and an Apps Script need not log a write it makes. **It shows no exclusion activity in that window; it cannot show that none has ever occurred.**

🔴 **A human editing the tab directly leaves no trace at all** — 🧪 the tab has a single header, `["Excluded Terms"]`, **one column**, and 🧪 **zero rows carry anything beyond column A**. No timestamp, no author, no source.

---

## 2. THE INBOUND-SCHEDULE PATH — 🔴 IT DOES NOT WRITE EXCLUSIONS

**Traced end to end, and the answer is negative.**

🧪 `app/api/inbound-schedule/route.ts` is **344 lines and contains zero occurrences** of `exclu`, `Exclusions`, `sheets`, `append` or `spreadsheet`. 🧪 `app/api/manage/process-schedule/route.ts` is **44 lines with the same zero**.

🧪 The only caller of `add_exclusion_term` anywhere in the tree is 🔎 `app/manage/[token]/page.tsx:7569`:

```js
const res = await api('add_exclusion_term', { term: ev.venue_name })
```

🔎 That is `handleDeleteWithExclusion(ev)` in the **schedule-import review UI** — the operator is shown extracted events and clicks a per-row button. The term is **`ev.venue_name`**, and it goes to 🔎 `app/api/manage/route.ts:2171`, `upsert({ truck_id: truck.id, term: normalised })` — **the DB table, scoped to that truck.**

### 2.1 Can the truck's own name be extracted instead of the item?

**On this path: no, and for a structural reason.** 🔎 The field passed is `ev.venue_name`, taken from the reviewed event row. The truck's name is never in scope — the route already knows the truck from the token and stamps `truck_id` itself. 🔎 `normaliseExclusionTerm` (`lib/schedule-extract.ts:13`) only lowercases and strips punctuation.

🔴 **But this path cannot poison the scraper anyway**, for two independent reasons: it writes a table the scraper never reads, and it scopes every row to a `truck_id` so it could not become a global term. 🧪 The table holds **0 rows**, so either no operator has ever used the button or their rows are gone.

🔴 **THE BRIEF'S HYPOTHESIS IS NOT SUPPORTED.** *"Operators can email or submit their schedule, and a reply such as 'Transit MOT isn't an event' is meant to add an exclusion"* — **no such reply-parsing path exists in this repository.** ⚠️ I tested it rather than assuming it, as instructed, and the test is negative.

⚠️ **And yet `Transit Mot due` is row 135 of the tab.** 🧪 `discovery_events` also holds a Marky D's row whose `venue_name` is `Transit Mot`. **The only writer that could have put that string in the tab is W1** — the scraper's `exclusionsToAdd`, reading a Facebook post that said the van was off the road. ⚠️ **That is a mechanism consistent with the evidence, not a proof of what happened.**

---

## 3. CAN A TRUCK NAME EVER BE A LEGITIMATE ENTRY? — 🔴 NO

🔎 The set's purpose is stated by the prompt that populates it and by the check that consumes it:

- Populated by: *"explicit mentions that something is **NOT a food truck** (e.g., 'Live Music', 'Quiz Night')"* (`:689`, `:719`).
- Consumed at 🔎 `:850-855`: the **extracted truck name** is tested, and on a match **every event of that truck on that page is discarded**.

🔴 **A truck name in this set is always a defect. There is no reading under which it is correct.** The set answers *"is this listing a food truck at all?"* — so putting a food truck in it asserts the opposite of the truth, and the consequence is not a filtered listing but a silenced business.

⚠️ **The one adjacent case that is NOT this defect:** an operator brand used as a **venue** label. 🧪 `Off The Beaten Truck` is row 58 and `We Are Wintringham` row 66 — those are pitch operators appearing as venue names, and excluding them as *trucks* is still wrong, but it is a different confusion from `Steak & Honour`. ⚠️ Distinguishing the two needs a per-row judgement I have not made.

🔴 **And the mechanism is disjoint from the intended control.** `discovery_trucks.excluded` is a boolean with an admin toggle (🔎 `app/admin/page.tsx:1362-1370`), read by the public API (🔎 `app/api/discovery/events/route.ts:146, 254, 339`). 🧪 It is `false` for all of these. **The Sheet tab silences a truck with no UI, no audit and no way for an admin to see it.**

---

## 4. IS THE CHECK IN THE WRONG PLACE? — CONFIRMED, YES

🔎 The order in `scripts/run-scraper.js`:

```
:850   const normRawTruck = normalizeName(truckName);          ← the EXTRACTED name
:851   const isExcluded = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
:852-855   if (isExcluded) { … continue; }                     ← every event discarded
…
:870-872   if (site.sourceType === 'truck') { finalTruck = site.name; }
```

🔴 **Confirmed: the set is applied to the model's extracted name, 20 lines before the code decides that on a truck's own page the truck *is* the site.** So on `order.steakandhonour.co.uk` the question asked is *"is the string 'Steak & Honour' a non-truck?"* — when the answer was already known from the site list, which is where that page came from.

**The correct position, stated without proposing a change:** the check belongs **after** `finalTruck` is resolved, and it should apply only where the truck identity is genuinely in doubt — i.e. `sourceType === 'venue'`, where the page lists third parties. 🔎 On a truck page `finalTruck` is `site.name` by construction, so a truck-page listing can never be a non-truck and the check has nothing to do. ⚠️ **Moving it would not have saved `Kerief` or `The Linton Kitchen`, whose pages are Facebook truck pages — it would.** Both are `sourceType: 'truck'`. **It would have saved every one of the five.**

*If this proved nothing:* the two lines could be in different branches, making the order irrelevant. Ruled out — both sit in the same `for` loop over `finalEvents`, with `:851`'s `continue` unconditionally preceding `:871`.

---

## 5. ORDER AND PROVENANCE — SUGGESTIVE, NOT CONCLUSIVE

🧪 **The tab is single-column with no adjacent data on any row**, so order is the only signal available.

🔎 W1 uses `values.append` to `Exclusions!A:A`, which adds at the bottom. **So for scraper-written rows, sheet order is insertion order.** ⚠️ A human typing into the next empty row also appends; a human inserting mid-sheet does not. **Order is therefore informative but not attributable.**

### 5.1 Do the truck-shaped entries cluster? — 🔴 No. They are scattered.

🧪 Truck- or business-shaped entries by row number:

```
  9 AXLE + HOP          33 Humdinger            34 Azahar Spanish Food   35 Not working Humdinger
 46 Sudbury Market      58 Off The Beaten Truck 61 Bertram Blacks Burgers 66 We Are Wintringham
 72 The Vine            74 Dessert MK           86 Jerk & Braai Cafe      93 Cake Shed
108 THE FLYING DUTCHMAN 118 JUST BAKED BY SOPHIE 125 Queen's Head        128 The Linton Kitchen
134 IVY & BOND Tea Cosy & Coffee
```

**They are spread from row 9 to row 134, interleaved with item-shaped rows throughout.** 🔴 **There is no block of truck names anywhere** — which is what a single human paste would look like. **This is consistent with one-at-a-time appends as each was encountered, which is W1's signature.** ⚠️ It is equally consistent with a human adding one name whenever they noticed a bad listing. **Order cannot separate those two.**

### 5.2 The content shape is the stronger signal — and it still is not proof

🧪 A large share of the 143 rows are **menu items and operator status text**, not categories:

```
dish/offer names : SURF 'N' TURF · THE SUNDAY ROAST BURGER · TACO TUESDAY · WINGS WEDNESDAY
                   Mega Munch boxes · Pork Stew of the week · Plain Scones to takeaway
                   Monday munchies · NEW WORLD WINE
absence text     : Transit Mot due · Haircut · 8.55 appointment @ dr · family funeral
                   Gas delivery · TRAINING DAY AT HOME · Prep for Armour fest · Closed Today
                   NO TRUCK THIS WEEK · No Pizza Van · Not working Humdinger · No RWE
                   "No Pizzas as he has a gun !"
sentence fragments: "There will be no food trucks on Saffron Walden Common on Thursday 16 July."
                   "Keep your eyes on England, not the hob. ⚽🔥 Have"
                   "Supporting Small Business: An Update on Our Journey"
                   "Disco Shed with the Freewheeler DJ's spinning all the tunes"
                   Page · Food Truck  ·  Page
```

⚠️ **`Page · Food Truck` and `Page` are Facebook page-metadata labels** — they appear in the `innerText` of a Facebook profile, never in anything a person would type as an exclusion. 🔴 **A truncated sentence ending mid-word (`…⚽🔥 Have`) is machine output, not a human entry.**

**So: much of this tab is unmistakably model-generated.** ⚠️ **But that does not attribute any *specific* row, and certainly not the three truck names, which are exactly the rows a human might also have added.**

---

## 6. THE FULL DAMAGE — AND IT IS SMALLER THAN THE BRIEF STATES

🧪 **Recomputed against the tab as it stands now.** The brief and my own scroll-lazy report said five; **three remain**, because three were removed in the last two hours (§ headline).

| Truck | how it matches | events held | future | newest `URL:` event created | discarded |
|---|---|---|---|---|---|
| **Axle & Hop** | fuzzy → tab row 9 `AXLE + HOP` | 1 (all `URL:`) | 0 | **2026-07-09** | 🔴 unknown |
| **Dessert MK** | exact → row 74 | 3 (all `URL:`) | 0 | **2026-06-12** | 🔴 unknown |
| **The Linton Kitchen** | exact → row 128 | 13 (all `URL:`) | 0 | **2026-08-10** | 🔴 unknown |
| ~~Steak & Honour~~ | **no longer in the tab** | 3 (`hatchesup_scraper` only) | 0 | never had one | — |
| ~~The Noodle & Dumpling Bar~~ | **no longer in the tab** | 16 (7 `URL:`, 9 `Drive Screenshot`) | 2 | 2026-09-06 | — |
| ~~Kerief~~ | **no longer in the tab** | 16 (all `URL:`) | 0 | 2026-08-10 | — |

🧪 **Zero venue-tab site names are blocked** (0 of 7).

### 6.1 🔴 How many events each has had discarded — UNKNOWABLE

**I cannot answer this and will not estimate it.** 🔎 `:852-855` `continue`s with a `console.log` and no counter reaching any store. 🔎 `discovery_run_log` has an `events_filtered` column (`supabase/migrations/20260907_discovery_run_log.sql:59`) that would have recorded exactly this — **and the migration is still not applied.** The only trace is a GitHub Actions run log, subject to its own retention.

⚠️ **What the data does bound:** the **last `URL:`-sourced event created** for each truck is an upper bound on when its term started biting.

```
Dessert MK          → 2026-06-12
Axle & Hop          → 2026-07-09
The Linton Kitchen  → 2026-08-10      Kerief → 2026-08-10   (both now unblocked)
```

🔴 **Kerief and The Linton Kitchen stop on the same day, 10 August.** ⚠️ **That is suggestive of a single event adding both terms, and it is not proof** — two trucks can stop appearing on the same day for unrelated reasons, and a page can stop listing a truck without anything being excluded. **To separate those you would need the run log, which does not exist.**

---

## 7. 🔴 THE ANSWER TO THE QUESTION ASKED

**Did a person add these, or an automation?**

🔴 **I cannot tell, for any individual row, and I am saying so rather than inferring from plausibility.** The tab has no provenance column, no adjacent data, and no timestamps. **A human entry and an AI-proposed one are byte-identical in it.**

**What is established:**

1. ✅ **An automated writer exists, is unguarded, and needs no human approval** — 🔎 `run-scraper.js:784-790`. Its only checks are non-empty, is-a-string, and not-a-duplicate. **Nothing compares a proposed term against the truck list.**
2. ✅ **Much of the tab is unmistakably machine-generated** — Facebook page-metadata labels, a sentence truncated mid-word, dish names, operator absence text.
3. ✅ **No other automated writer to the tab is evidenced.** The inbound-schedule path has no exclusion code; the operator UI writes a different, per-truck store; the Apps Script log shows no exclusion activity in its 19-hour window.
4. ✅ **A human can and does edit the tab directly** — 🧪 three rows were removed in the two hours between my readings.
5. 🔴 **So yes, this is self-poisoning that will recur**, whatever the origin of these three names — because the mechanism in (1) runs on every discovery pass and nothing stops it proposing a truck name again.

**The single further read that would settle attribution:** 🧪 the Sheet's **Drive revision history**, which records `lastModifyingUser` per revision and would show either `scraper-bot@village-foodie-maps.iam.gserviceaccount.com` (the automation) or a person's address. 🔴 **I attempted it and it is unavailable: the Drive API is disabled on Google Cloud project `227274860029`.** Enabling it and calling `drive.revisions.list` on the spreadsheet is the one read that answers this question definitively.

---

## 8. WHAT REMAINS UNREAD

- 🔴 **Attribution of any individual row.** Blocked on the Drive API.
- 🔴 **How many events were discarded**, ever. No counter is persisted; `discovery_run_log` is unapplied.
- ⚠️ **Whether an Apps Script writes the tab.** The 19-hour rotating log shows nothing; that is not proof.
- ⚠️ **Who removed the three rows today, and whether more were removed** — I only know the count fell 146 → 143 and which three are gone.
- ⚠️ **Whether the other business-shaped entries** (`Azahar Spanish Food`, `Bertram Blacks Burgers`, `Jerk & Braai Cafe`, `Cake Shed`, `The Vine`, `Queen's Head`, `THE FLYING DUTCHMAN`, `IVY & BOND`, `Humdinger`) are trucks that should be scraped. 🧪 None is in the current site list, so none is blocking a scrape **today** — but they would block one if added.
- ⚠️ **Why `excluded_terms` holds 0 rows** despite W3 being correctly written — no operator use, or rows removed. Not investigated.

---

## 9. STATE AT END

Counts END = START: `discovery_events` **4,300**, `venues` **559**, `discovery_trucks` **231**, `excluded_terms` **0**.

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

**27 modified, 102 untracked, 0 staged** — identical to START apart from this report. `HEAD = 801de1c`, `origin/main = 08ac368`. **No file changed, no database row written, the Sheet not modified, nothing staged, committed, pushed or added. No fix proposed.**
