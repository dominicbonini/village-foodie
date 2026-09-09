# The schedule-extraction paths, compared — which core survives

**9 September 2026 · READ-ONLY.** No source file changed. **No database row inserted, updated or deleted**
(every call was a `select`). The Sheet was not touched. Nothing staged, committed or pushed; `git add` was
not run in any form. The only file written is this report.

⚠️ **ONE APPARENT CONTRADICTION IN THE BRIEF, RESOLVED NOT CHOSEN.** *"Change NO file"* and *"write your
full report to `docs/extraction-paths-comparison-report.md`"* both appear. I read the first as scoping the
**comparison** (change nothing you are comparing) and the second as the explicit deliverable — the same
shape as every prior task in this series. **No source, config, migration or manual was touched.** If that
reading is wrong, the fix is to delete this one file.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (output quoted) · ⚠️ qualified · 🔴 danger.

**Extensions searched:** 🔴 **none scoped.** Every sweep was `grep -rn -I … .` excluding only
`node_modules`, `.next`, `.git` (and `docs` where noted). `scripts/run-scraper.js` is **JavaScript** and was
in scope throughout; the app is TypeScript. **Every grep's exit code was checked** — see §0.2 for the one
that would have produced a false negative.

---

## 0. STATE, AND TWO METHOD FAILURES WORTH RECORDING

**`git status --short` — START and END identical**: 6 `M`, 16 `??`. `HEAD` = `origin/main` = `9e83a5e`,
unchanged. The only new path at END is this report.

| table | START | END |
|---|---|---|
| `discovery_events` | 4,300 | 4,300 |
| `truck_events` | 137 | 137 |
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_exclusion_terms` | 143 | 143 |
| `trucks` | 9 | 9 |

🧪 Counts are from PostgREST's `content-range` with `Prefer: count=exact`, **not** from `length` on a
fetched array — the failure mode that produced three wrong numbers earlier in this series. Where rows were
fetched (§7) the fetched length was **asserted against the count header** and printed: 4,300 = 4,300 ✅ and
137 = 137 ✅.

### 0.1 🔴 The premise in the brief is wrong, and it changes the comparison

> *"c) the SCREENSHOT extractor built today, which reuses `app/api/manage/process-schedule/route.ts`"*

🔎 **It does not reuse it, or anything it imports.** `app/api/admin/screenshot-events/route.ts:19-25`
imports `next/server`, `@supabase/supabase-js`, `@/lib/auth/admin` and `@/lib/admin/screenshot-events` —
**and nothing else**. 🔎 `lib/admin/screenshot-events.ts:17` imports **only** `@/lib/venue-signature`.
Neither file mentions `process-schedule` or `schedule-extract` except in a comment at
🔎 `lib/admin/screenshot-events.ts:8` headed *"WHY THIS IS NOT `lib/schedule-extract.ts`"*.

**So it is a FOURTH independent implementation, not a reuse** — which makes the merge question sharper, not
softer: today's work added a divergence rather than removing one.

### 0.2 ⚠️ The grep that would have printed a confident false negative

A sweep for `generativelanguage.googleapis.com` across every file returned **13 hits and exit 0** — and
**`scripts/run-scraper.js` was not among them.** Read alone, that says *the scraper does not call Gemini*.
🔎 It does: `scripts/run-scraper.js:2` `import { GoogleGenerativeAI } from '@google/generative-ai'`, `:1039`
`new GoogleGenerativeAI(...)`. **The SDK never spells the URL**, so a URL-shaped search cannot see it.
**Ruled out by searching for the mechanism (`GoogleGenerativeAI|getGenerativeModel|gemini`) as well as the
endpoint** — exit 0, 7 hits. *A true negative and a wrong-shaped query print the same nothing.*

---

## 1. THE REAL CALLER LIST — SIX PATHS, EIGHT PROMPT SITES, NOT THREE

🧪 Established by sweeping for **both** Gemini mechanisms plus every importer of `lib/schedule-extract`.

| # | Path | Prompt site | Core |
|---|---|---|---|
| **A** | Scraper **discovery pass** — event branch | 🔎 `run-scraper.js:1230` | inline |
| **B** | Scraper **discovery pass** — RULE branch (`scrape_rules`) | 🔎 `run-scraper.js:1198` | inline, **different output shape** |
| **C** | Scraper **HatchGrab loop** (`buildHgPrompt`) | 🔎 `run-scraper.js:2075` | inline |
| **D** | **Operator importer — file/text** (`process-schedule`) | 🔎 `lib/schedule-extract.ts:25` | shared lib |
| **E** | **Operator importer — URL** (`verify-schedule-url`) | 🔎 `lib/schedule-extract.ts:25` | shared lib |
| **F** | **Admin screenshot** (built today) | 🔎 `lib/admin/screenshot-events.ts:103` | own lib |
| **G** | Apps Script **vendor email** | 🔎 v6.57 `:491` | independent |
| **H** | Apps Script **Drive screenshots** | 🔎 v6.57 `:594` | independent |

⚠️ **E was not in the brief's list of three** and is a distinct caller with a distinct gate and a distinct
side effect (it writes `trucks.scraper_rule`). ⚠️ **B is not an event extractor at all** — it emits
recurring *rules* (`freq`, `day`, `startDate`, `endDate`), a shape no other path can express.

🔎 A ninth Gemini site, `app/api/manage/geocode/route.ts:32`, is **not** schedule extraction but is
load-bearing for §3 and is treated there. Non-schedule Gemini callers excluded from scope:
`lib/menu-extract.ts`, `lib/whatsapp-classifier.ts`, `app/api/manage/process-allergens`.

---

## 2. THE PROMPTS — AND 🔴 WHICH ONE ACTUALLY PRODUCED THE POSTCODE FIGURE

### 2.1 What each asks for

| | **A** scraper events `:1230` | **D/E** app `schedule-extract.ts:25` | **F** admin screenshot `:103` | **H** Apps Script Drive `:594` |
|---|---|---|---|---|
| truck name field | ✅ `"Truck Name"` | 🔴 **NO — the type has none** (`:1-9`) | ✅ `"Truck Name"` | ✅ `"Truck Name"` |
| village / town | ✅ `Village` (MANDATORY) | ✅ `town` | ✅ `Village` | ✅ `Village` |
| 🔴 **postcode** | 🔴 **NO FIELD** — rule 7: *"Postcodes, addresses, or extra event details go into the `Notes` field"* | ✅ **dedicated `postcode`** + 5 POSTCODE RULES + examples | ✅ **dedicated `Postcode`** | 🔴 **NO FIELD** |
| address | ❌ | ✅ `address`, street-level only | ❌ | ❌ |
| date reference table | ❌ — *"Current Date: …"* only | ✅ **14-day table**, *"do not calculate"* | ✅ **14-day table**, *"use ONLY these exact dates"* | ✅ 14-day table |
| invalid-venue skip | ❌ (post-filter only) | ✅ in prompt, **5 names** | ✅ in prompt, **9 names** | ✅ in prompt, **5 names** |
| private-event ban | ✅ rules 10 + a hard post-filter | ❌ | ❌ | ❌ |
| anti-hallucination | ✅ **rules 1, 2, 3, 11, 12** — explicit dates override, preserve the whole week, *"NEVER extract on 'tonight'/'today'"*, proximity requirement | ⚠️ none — and see ENRICH below | ⚠️ *"Never output a year earlier than ${currentYear}"* | ⚠️ *"Never output 2023, 2024, or 2025"* (hard-coded) |
| 🔴 **ENRICH / invention** | ❌ | 🔴 **YES — STEP 2: *"fill in any missing fields using your knowledge… look up the UK postcode for that venue"*** | ❌ | ❌ |
| exclusion proposal | ✅ `exclusionsToAdd` | ❌ | ❌ | ❌ (the **email** path G has it, `:495`) |
| per-site hint injection | ✅ `${site.instructions}` | ❌ | ❌ | ❌ |

### 2.2 🔴 Which prompt produced which figure — the brief's attribution is wrong

> *"The app's extractor asks; the Apps Script's does not — 0 postcodes in 517 rows against 1,100 of 2,952 scraper rows."*

**The two figures are right. The attribution of the first is not.**

- 🧪 **1,100 / 2,952** is the **scraper's discovery prompt (A)**, `run-scraper.js:1230` — which has **no
  postcode field at all.** The postcodes arrive because **rule 7 dumps them into `Notes`**, which the mirror
  maps to `discovery_events.ai_notes` (🔎 `run-scraper.js:2305`). 🔴 **They are free text in a catch-all
  column, not a parsed field.** ⚠️ This is `discovery_events`, which 🧪 **has no `postcode` column at all**
  (`42703` on `select=postcode`), so `ai_notes` is the only place a postcode can be — which is §14 of the
  pipeline manual's point.
- 🧪 **0 / 517** is the **two Apps Script prompts (G + H)** — 0/511 Drive + 0/6 vendor email. ✅ Correct.
- 🔴 **The app's extractor (D/E) contributed 0 of both figures**, because **it never writes to
  `discovery_events`.** Its output goes to `truck_events` (§5). Measured there: 🧪 **21 of 57**
  `source='manual'` rows carry a real `postcode` (37%).

**So the honest form of the claim is:** *the only prompt with a real postcode field is the app's, and its
rows are in a different table; the scraper's 37% is a Notes side effect; both Apps Script prompts produce
none.* ⚠️ **If it were proving nothing:** a regex matching nothing looks identical to a true zero. 🧪 Ruled
out — **the same regex in the same run returned 1,100 hits on scraper rows and 4/4 on the Pimp My Fish
manual rows.**

---

## 3. 🔴 VENUE CREATION AND GEOCODING — AND YES, ONE PATH STILL WRITES AN UNVALIDATED COORDINATE

### 3.1 Only one path creates venues

🧪 Repo-wide sweep for `from('venues')` with insert/upsert/update: **10 `from('venues')` sites, exactly ONE
writer** — 🔎 `scripts/run-scraper.js:2437`. ⚠️ The filtered result is a real filter, not a failed grep: the
unfiltered sweep printed 10.

**Nothing else creates a venue.** The operator importer, the admin screenshot path and
`/api/inbound-schedule` all only **match** existing venues (`lib/venue-matcher.ts` `findVenue`). The Apps
Script creates venues **in the Sheet only** (manual §16.6).

### 3.2 The scraper's gauntlet — Gemini as suggester, postcodes.io as authority

🔎 `run-scraper.js:2339` asks for a **postcode**, explicitly permitting refusal: *"🔴 If you are not
confident of the postcode, return null… An honest null is better than a wrong answer."* `lat`/`lng` are
*"OPTIONAL… only used if the postcode lookup fails"*. Then 🔎 `resolveCoordinates` (`scripts/geo-validate.js:348`)
resolves **postcodes.io first, Gemini last** (`:334` — *"never an unchecked coordinate"*), against a
**sentinel set derived from the live table** (any coordinate shared by 5+ venues is an "I don't know"
marker). 🔎 `:2437-2443` then stores `latitude: r.ok ? r.latitude : null` — **a rejected coordinate is not
stored, and the row still is**, so the venue stays a matching target without a wrong pin.

### 3.3 🔴 THE OPERATOR PATH WRITES GEMINI'S RAW COORDINATES INTO `truck_events`

🔎 `app/api/manage/geocode/route.ts:16-22` — the whole prompt:

> *"You are a geocoding service. Return ONLY a JSON object with the latitude and longitude for this
> location… `{ "lat": 52.1234, "lng": 0.5678, "confidence": "high|medium|low" }`"*

**No postcodes.io lookup. No sentinel check. No distance-to-village check. No `partial_match` test.** The
model's numbers are returned as-is (`:52-56`).

🔎 Called from `app/manage/[token]/page.tsx:6569` via `geocodeLocation`, at **three** sites — `:3384`
(onboarding schedule save), `:6982` (manual event edit), `:7045` (**the schedule-import review save**) —
each passing the result straight into `api('upsert_event', { …, latitude: lat, longitude: lng })`. 🔎
`app/api/manage/route.ts:821` / `:838` writes it to `truck_events.latitude/longitude`.

🧪 **The measurement agrees:** `truck_events` `source='manual'` carries lat/lng on **25 of 57 rows (44%)**
and a `venue_id` on **0 of 57 (0%)** — coordinates with no validated venue behind them. The bridge-written
rows (`source='scraper'`) carry `venue_id` on **61 of 80 (76%)** and lat/lng on the same 61, **from the
matched venue**, i.e. already through the gauntlet.

🔴 **So the answer to the brief's question is yes.** The manual records the unvalidated geocoder as an Apps
Script problem (§16.7) being retired. **It is also live in the app, on the operator path, today** — and
⚠️ `confidence` is requested by the prompt and then **discarded**: `:52-56` returns it and the caller
(`:6572-6574`) destructures only `lat, lng`. ⚠️ **I cannot separate importer-created rows from
hand-created ones inside `source='manual'`** — both go through `upsert_event`, and no column distinguishes
them. The provenance of the coordinates is identical either way.

---

## 4. MATCHING AND FILTERS — 🔴 FOUR EXCLUSION MATCHERS NOW, NOT THREE

V1.6 §16.3 records three. **Today's build added a fourth.**

| | normaliser | match rule | applied to | executing line |
|---|---|---|---|---|
| **scraper** (A/C) | `normalizeName` — strips stop-words **and spaces**, chops trailing `s` | **Levenshtein ≤ 1** | 🔴 **TRUCK name** | 🔎 `run-scraper.js:55`, `:67`, used `:1450` |
| **Apps Script** (G/H) | `normalizeTruckKey` — **byte-identical** to the above | 🔴 **containment** (`includes` either way) | 🔴 **TRUCK name** | 🔎 v6.57 `:1235`, `:1243` |
| **app** (D/E) | `normaliseExclusionTerm` — lower-case, strip punctuation, **KEEPS spaces** | 🔴 **substring** | 🔴 **VENUE name** | 🔎 `lib/schedule-extract.ts:13`, `:17`; call sites `app/manage/[token]/page.tsx:7525, 7526, 7579` |
| **admin screenshot** (F) | `normalizeVenue` (mirror of the scraper's) | **Levenshtein ≤ 1** | **TRUCK name** | 🔎 `lib/admin/screenshot-events.ts` via `lib/venue-signature` |

🔴 **The app's is the odd one out on all three axes** — different normaliser, different match rule, and it
asks the question of the **venue**, not the truck. It is also **per-truck** (`excluded_terms` scoped by
`truck_id`, 🔎 `app/api/manage/route.ts:2167`), whereas the other three read one **global** set.

⚠️ **Where the exclusion check runs also differs.** The scraper's is gated: 🔎 `run-scraper.js:1454`
`const isExcluded = termHit && site.sourceType !== 'truck'` — **not applied on a truck's own page** (the
V1.3 fix), with a loud near-miss log at `:1462`. **No other path has that gate.** ⚠️ **The manual's §11.1
pointer `:859-869` is stale** — the file has moved under the uncommitted workstreams; the filter is now at
**`:1448-1462`**. The behaviour §11.1 describes is correct.

**Invalid-venue lists:** 🔎 `lib/schedule-extract.ts:11` — **5** entries, matched by **exact equality** on
the trimmed lower-cased name (`:186`). 🔎 `lib/admin/screenshot-events.ts` — **9** entries, matched by
equality **or `startsWith`**. 🔎 Apps Script `:601` — 5 names, in the prompt only. The scraper (A) has
**no** invalid-venue list at all.

**Truck matching:** A/C match the site to its truck by the **site list** (`finalTruck = site.name`), so
identity is settled before extraction. D/E take the truck from the **dashboard token** — the prompt is never
told a truck name and the type has no field for one. F takes it **from the image**, per row. G/H match the
sender or the image against the Sheet.

**Venue matching:** only `/api/inbound-schedule` resolves a `venue_id`, via `findVenue`
(🔎 `lib/venue-matcher.ts`). **D/E resolve none** — hence 0%.

---

## 5. THE WRITE — AND WHICH PATHS EMAIL THE OPERATOR A TOKEN LINK

| path | lands in | via | bridges to `truck_events`? | 🔴 emails operator? |
|---|---|---|---|---|
| **A** scraper discovery | `discovery_events` + the Sheet | 🔎 **direct** `supabase.from('discovery_events').upsert` `run-scraper.js:2312` | ❌ **no** | ❌ no |
| **B** scrape_rules | the Sheet (rules), then events via A | — | ❌ | ❌ |
| **C** scraper HatchGrab loop | `discovery_events` | 🔎 **POST** `/api/inbound-schedule` `run-scraper.js:2197` | ✅ **yes** | ✅ **yes** |
| **D/E** operator importer | 🔴 **`truck_events` directly**, `source:'manual'` | 🔎 `upsert_event` → `app/api/manage/route.ts:838` | n/a — already there | ❌ no |
| **F** admin screenshot | `discovery_events` | 🔎 **POST** `/api/inbound-schedule` `route.ts:129` | ✅ **yes** | ✅ **yes** |
| **G/H** Apps Script | `discovery_events` | 🔎 **POST** `/api/inbound-schedule` v6.57 `:32-52` | ✅ **yes** | ✅ **yes** |

🔴 **The bridge gate**, 🔎 `app/api/inbound-schedule/route.ts:137-153`: the extracted truck name must match
a `discovery_trucks` row carrying a **`hatchgrab_truck_id`** (containment on `normName`), **and** that
truck's `scraper_preference` must not be `'manual'`. Then reject-memory (`:163-171`) and dedup (`:186-196`),
then 🔎 `:212` `insert` into `truck_events` with `status:'unconfirmed'`, then 🔎 `:250-270` **one email per
truck** carrying `${NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=schedule`.

⚠️ **So three of the six paths can email a real operator a token-bearing link as a side effect of
extraction** — including **F, built today**. Only D/E (which the operator is already driving) and A cannot.

🔴 **D/E return events to the browser and write nothing themselves.** 🔎 `process-schedule/route.ts:38`
returns `{ events }`; the write happens later from the review UI. **The only DB write either makes is
`verify-schedule-url` pinning `trucks.scraper_rule`** (🔎 `:225-228`).

---

## 6. WHAT EACH DOES THAT THE OTHERS CANNOT — the merge's real cost

### Scraper only (A/B/C)
1. 🔴 **Per-site `ai_instructions` injected into the prompt** — 🔎 `:1198` `${site.instructions}` and `:1236`
   *"🚨 CRITICAL USER HINT FOR THIS WEBSITE"*. **No other path can be told anything about a specific site.**
2. 🔴 **Strategy dispatch — SIX strategies + default**, 🔎 `:41-49`: `scroll_lazy`, `click_next`, `frames`
   (`performFrameDump`), `manual`, `manual_single`, `scrape_rules`. **D/E have two.**
3. 🔴 **`manual` / `manual_single`** — produce events from the *instructions alone*, 🔎 `:1165-1172`, with
   **no page fetch**. Nothing else can create a schedule for a truck with no usable website.
4. 🔴 **`scrape_rules` (B)** — emits **recurring rules** (`freq`, `day`, `startDate`, `endDate`), a shape
   `ExtractedEvent` cannot represent.
5. **Private-event hard filter** — 🔎 `:1465-1470`, post-extraction, on venue + notes.
6. **Exclusion-term proposal** with the poison guard (manual §11.2).
7. **Venue creation with the postcodes.io gauntlet** (§3.2).
8. **Adaptive scheduling, change-detection hashes, zero-event retry with strategy re-pin** (🔎 `:2134-2157`).
9. **Model tiering** — 🔎 `:1266-1272` `modelLite` (`gemini-2.5-flash-lite`) by default, upgrading to
   `modelHeavy` **only if the site name contains `'howe'`**. ⚠️ A hard-coded truck name in a model selector.

### Operator importer only (D/E)
1. 🔴 **Three input kinds** — a URL (E), an uploaded **image**, or pasted **text** (D, 🔎 `:31-36`).
   ⚠️ **The image path already exists here**, which is what makes F's independence expensive.
2. 🔴 **The ENRICH step** — knowledge-based inference of postcode and town (`:79-84`). **No other path
   invents a missing field.**
3. **Dedicated `postcode` and `address` fields** with format rules and worked examples.
4. **Both strategies raced and the longer text chosen** (🔎 `:184-196`), then the winner **auto-pinned** to
   `trucks.scraper_rule`.
5. **Reachability diagnosis** — `blocked` (4xx) vs `unreachable` (DNS/cert) vs `no_content` vs
   `launch_failed` (🔎 `:200-213`), so a bot-block is never reported as a bad URL.
6. **A human review UI before any write**, with per-event editing and per-truck exclusion terms.
7. **Reject-memory** — `rejected_event_signatures` (🔎 `app/api/events/action/route.ts:232`) so a declined
   event does not re-surface.

### Admin screenshot only (F)
1. 🔴 **Many trucks in one image** — every other in-repo path is single-truck-per-input by construction
   (D/E take the truck from the token; A/C from the site list).
2. **Per-row drop reasons surfaced to the operator** rather than discarded.
3. **Admin auth** rather than a dashboard token.

### 🔴 The capability difference that decides the design
**`lib/schedule-extract.ts`'s `ExtractedEvent` (`:1-9`) has NO `truck_name`.** D/E don't need one. **A, C, F,
G and H all do.** A merge onto that type silently drops the truck from five of six paths — the exact failure
mode the brief names.

---

## 7. 🧪 MEASURED QUALITY

**Source conventions counted** (🧪 full-table, paginated with `limit`/`offset`, fetched length asserted
against the count header):

- `discovery_events.source` — `URL: <url> | Strategy: <s>` = **A**; `hg_scraper:<rule>` = **C**;
  `Drive Screenshot` = **H**; `Email Scheduler` = **G**; `hatchesup_scraper` / `Manual Entry` /
  `Mobile Screenshot` = other importers; `Admin Screenshot` = **F**.
- `truck_events.source` — `'scraper'` = written by the **inbound-schedule bridge**; `'manual'` = written by
  **`upsert_event`**, which is the operator importer **and** hand-created events (⚠️ not separable).

**`discovery_events`** — 🔴 postcode measured in **`ai_notes`**, because the table has **no `postcode`
column**:

| path | rows | `venue_id` | postcode in `ai_notes` | has start_time |
|---|---|---|---|---|
| **A** scraper discovery | 2,952 | 1,133 (38%) | **1,100 (37%)** | 2,465 (84%) |
| **C** scraper HatchGrab loop | 108 | 80 (74%) | **0 (0%)** | 85 (79%) |
| **H** Apps Script screenshots | 511 | 426 (83%) | **0 (0%)** | 458 (90%) |
| **G** Apps Script vendor email | 6 | 6 (100%) | **0 (0%)** | 6 (100%) |
| `hatchesup_scraper` | 108 | 5 (5%) | 0 | 108 (100%) |
| `Manual Entry` | 589 | 400 (68%) | 0 | 589 (100%) |
| `Mobile Screenshot` | 9 | 6 (67%) | 0 | 9 (100%) |
| **F** admin screenshot | 🔴 **0** | — | — | — |
| *(null source)* | 12 | 11 (92%) | 0 | 12 (100%) |

**`truck_events`** — has real `postcode` and `latitude` columns:

| source | rows | `venue_id` | postcode | start_time | lat/lng |
|---|---|---|---|---|---|
| `scraper` (the bridge) | 80 | **61 (76%)** | 43 (54%) | 63 (79%) | 61 (76%) **validated** |
| `manual` (**D/E** + hand) | 57 | 🔴 **0 (0%)** | 21 (37%) | 57 (100%) | 🔴 **25 (44%) UNVALIDATED** |

**What these numbers do and do not show:**
- 🔴 **C's 0% postcode is the strongest single result here.** `buildHgPrompt` (`:2075`) is the scraper's
  *other* prompt, and unlike A it has no Notes catch-all — **so 37% vs 0% is a prompt difference within one
  codebase, on the same model, against the same kind of page.** Prompt wording, not model capability,
  produced the 1,100.
- ⚠️ **`venue_id` share measures the WRITE path, not extraction quality.** A is 38% only because it
  upserts directly with **no `venue_id` in the payload** (🔎 `:2300-2309`); its 1,133 are hand backfills.
  C/H/G are 74–100% because they go through the route's `findVenue`. **It says nothing about which prompt
  read the page better.**
- ⚠️ **F has produced zero rows** — built today, never run against production. **No quality claim about it
  is possible**, and none is made below.
- ⚠️ *If it were proving nothing:* a truncated page read as a whole table. 🧪 Ruled out by asserting fetched
  length against the count header on both tables and printing the assertion.

---

## 8. 🔴 WHAT WOULD BE LOST BY MERGING — stated before the recommendation

1. **The truck name**, if `ExtractedEvent` is adopted unchanged — five of six paths need it (§6).
2. **`scrape_rules`' recurring-rule output** — `freq`/`day`/`startDate`/`endDate` cannot be expressed as
   dated events. **This must not be merged at all.**
3. **`manual` / `manual_single`** — schedules with no page to fetch.
4. **Per-site `ai_instructions`** — unless the shared builder takes a free-text hint parameter.
5. **The scraper's anti-hallucination rules** (explicit-dates-override, preserve-the-whole-week, the
   Facebook "tonight" ban, the proximity requirement). These were tuned against messy Facebook pages;
   **`schedule-extract`'s prompt has no equivalent of any of them.**
6. 🔴 **The reverse hazard, which is worse.** `schedule-extract`'s **ENRICH** step tells the model to
   *"look up the UK postcode for that venue"* from its own knowledge. **Pointing the scraper at that prompt
   would start writing model-invented postcodes into `discovery_events.ai_notes`** — into the pipeline whose
   entire geo design (§3.2) exists to keep model guesses out. ⚠️ **A merge in that direction is a
   regression, not a consolidation.**
7. **The source-type exclusion gate** (`sourceType !== 'truck'`) — the fix that stopped five real trucks
   being silenced. It has no counterpart in the app's matcher.
8. **Error visibility.** 🔎 `lib/schedule-extract.ts:169-171` returns **`[]` on any Gemini failure** —
   *"a failed extraction is indistinguishable from an empty schedule."* F's route (`:60-64`) reports the
   error per file. **Adopting the lib as-is would make failures silent on paths that currently report them.**
9. **Retry semantics differ.** `schedule-extract` retries **any** error 3× at 2 s (`:114-147`);
   F retries **only 429/503**; the scraper's `generateContentWithRetry` (`:242`) is a third policy.
   **A shared core must pick one, and "retry a 400 three times" is the wrong one.**

---

## 9. RECOMMENDATION

### 9.1 The core that survives

🔴 **`lib/schedule-extract.ts` survives as the shared core — but not in its current shape, and not as a
single prompt.** It is the only implementation that already handles **text *and* images** through one entry
point (`:152-165`), already has the postcode/venue/town split the other paths lack, and is already imported
by two callers. **It is the right skeleton and the wrong prompt.**

Three things must change before anything else adopts it, and each is a *capability* fix, not a tidy-up:
`ExtractedEvent` must gain an **optional `truck_name`**; the failure path must **raise instead of returning
`[]`**; and the prompt must become a **builder parameterised by input kind**, not one string.

### 9.2 One prompt cannot serve all three inputs

**No — and the measurement in §7 is the argument.** A and C are the same model, the same codebase and the
same kind of page, and they differ **37% vs 0%** on postcode capture *because of prompt wording alone*.
Prompt text is the highest-leverage variable in this system; collapsing it to one string discards that
leverage.

**What is genuinely common** (share it): the 14-day date table and *"do not calculate"*; `DD/MM/YYYY` and
`HH:MM`; empty-string-never-`00:00`; the venue/town/postcode split rules; the invalid-venue skip list; the
JSON contract and the fence-stripping parser.

**What must vary by input:**

| | scraped page (A/C) | operator URL/text/image (D/E) | photo, many trucks (F) |
|---|---|---|---|
| truck identity | from the site list — **do not extract** | from the token — **no field** | 🔴 **extract per row** |
| ENRICH | 🔴 **OFF** — postcodes.io owns this | ✅ on | ⚠️ off (admin can't verify a guess) |
| anti-hallucination | 🔴 **full set** (tonight-ban, proximity) | light — the operator chose the page | light |
| per-site hint | ✅ required | ❌ | ❌ |
| exclusion proposal | ✅ | ❌ | ❌ |

**So: one core, one shared rule-block, three prompt profiles.** That is a parameterised builder, not a
merge.

### 9.3 What each path becomes

| path | verdict |
|---|---|
| **D/E** operator importer | **The reference caller.** Already on the core. |
| **F** admin screenshot | 🔴 **Becomes a caller** — the `multi-truck` profile. Its 9-name invalid-venue list and its per-row drop reasons move **into** the core (both are improvements the other callers should inherit). Its exclusion matcher is already the scraper's rule, so no third semantics is introduced. |
| **C** HatchGrab loop | **Becomes a caller** — the `scraped-page` profile with ENRICH **off**. 🔴 **The prize: it is the 0%-postcode path**, and the core's postcode field is exactly what it lacks. **Highest value, lowest risk — do this one first.** |
| **A** discovery event branch | **Becomes a caller last**, same profile, only after the per-site hint and the full anti-hallucination block are parameters. |
| **B** `scrape_rules` | 🔴 **STAYS INDEPENDENT. Do not merge.** Different output shape entirely. |
| **G/H** Apps Script | **Deleted with the trigger**, not ported. G is already dead in the database (V1.6 §19.0); H is the only one still producing rows, and F is its replacement. |
| **`app/api/manage/geocode`** | 🔴 **Stop writing its output.** Route operator coordinates through `geo-validate.js`'s `resolveCoordinates`, or store none. **This is independent of the merge and should not wait for it.** |

### 9.4 Sequence, and what proves each step **in production**

1. **Fix the unvalidated geocoder (§3.3).** Independent of everything else.
   **Proof:** new `truck_events` rows with `source='manual'` carry a coordinate **only** when a postcodes.io
   lookup succeeded; the 25 existing rows are re-resolved and any that move by more than a village's width
   are listed. **Falsifiable:** a row keeps a coordinate with no postcode behind it.
2. **Give the core `truck_name`, a raising failure path, and the profile parameter.** No caller changes yet.
   **Proof:** D/E behaviour is byte-identical before and after on the same input — **run the existing
   operator import and diff the returned `events` array.** A silent behaviour change here would be invisible
   later.
3. **Move C (HatchGrab loop) onto the `scraped-page` profile.**
   **Proof:** 🧪 the metric already exists and is currently **0%** — postcode presence on new
   `hg_scraper:` rows. **Anything above zero is the merge paying for itself; a drop in events-per-run is the
   signal to stop.** Compare one week either side, same trucks.
4. **Move F onto the core**, folding its invalid-venue list and drop reasons in.
   **Proof:** F has produced **0 rows**, so there is no regression to measure — the proof is a first real
   run producing events **with postcodes**, and the per-file drop reasons still visible in the panel.
5. **Move A last, behind the per-site hint parameter.**
   **Proof:** 🔴 **A is the highest-volume path (2,952 rows) and the one with the most tuned prompt.** Run
   both prompts over the same captured page text for a full cycle and diff the event sets **before**
   switching — decision equivalence, not set equality, the discipline §17.4 of the manual already
   established for the source switches. **Do not flip on a green run alone.**
6. **Turn off the Apps Script trigger; delete G/H.** After F has run for a week and H's 12-events-a-day is
   demonstrably replaced.

⚠️ **What would make me wrong about the order:** if C's pages turn out to carry no postcodes in their text
at all, step 3 produces 0% again and proves nothing about the merge. 🔎 **That is checkable before writing
any code** — the captured page text is already logged, and A's 37% comes from pages of the same kind.

---

## 10. CLAIMS I COULD NOT SETTLE

- ⚠️ **Which `truck_events` `source='manual'` rows came from the importer** vs hand entry. No column
  distinguishes them; the coordinate provenance is identical either way, so §3.3 holds regardless.
- ⚠️ **F's extraction quality.** Zero rows in production. Its prompt and filters were proven directly
  (`screenshot-upload-build-report.md`); its output has never been measured.
- ⚠️ **Whether A's 37% is representative** or dominated by a few sites with postcode-rich pages. Not
  broken down per site.
- 🔴 **Whether the two Puppeteer implementations behave identically.** `verify-schedule-url:63-104` says
  *"copied from scripts/run-scraper.js"*; I compared them by reading, **not by running both against the same
  URL.** ⚠️ They have already diverged in vocabulary — the scraper's discovery pass calls button-hunting
  `click_next` (🔎 `:43`) while the HatchGrab loop and the operator route call it `scroll_next`
  (🔎 `:2000`, `verify-schedule-url:186`). 🧪 **Not a live bug** — the HG loop uses its own `scrapeWithRule`
  (`:2003-2014`) rather than the `STRATEGIES` map, so the operator-written pin is consumed correctly. **I
  initially read this as a bug and it is not.** It is a merge hazard: two names for one behaviour, in two
  columns.
