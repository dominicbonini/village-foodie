# Moving event-screenshot upload into the HatchGrab admin section

**Date:** 9 September 2026 · **Mode:** READ-ONLY INVESTIGATION. **No file changed. No database row inserted, updated or deleted. No Sheet or Apps Script touched.** Nothing staged, committed or pushed; `git add` not run. **No code proposed and nothing built.**

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I` over `app components lib` with `node_modules`/`.next`/`.git`/`docs`/`ios`/`android` excluded (so `.ts`, `.tsx`, `.js`, `.json` were all in scope), plus targeted reads of `capacitor.config.ts`, `ios/App/App/Info.plist` and `docs/apps-script/village-foodie-v6.57.js`. 🧪 Every sweep's exit code was read; the four that returned hits exited 0, and none exited 2.

⚠️ **FLAGGING A STALE REFERENCE IN THE BRIEF, not a garbled span:** it cites the manuals as **V12.5** and **V1.4**. They were versioned to **V12.6** and **V1.5** in the preceding pass, and the sections cited are still present. I read the current versions.

⚠️ **Apps Script line numbers are the ORIGINAL file's.** The repo copy carries a 26-line reference header, so *repo line = original + 26*.

---

## 0. Row counts and working tree — START and END

| | START 21:58:46Z | END 22:01:45Z |
|---|---|---|
| `discovery_events` | 4,300 | 4,300 |
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_exclusion_terms` | 143 | 143 |

**`git status --short` identical at START and END** — 5 modified (`DEBUG_SCRAPED_TEXT.txt`, `app/providers.tsx`, both manuals, `scripts/run-scraper.js`, all pre-existing) and 11 untracked docs. `HEAD` = `origin/main` = `9e83a5e`. **This report is the only thing added.**

---

## 1. What `processFoodTruckScreenshots` actually does

🔎 `docs/apps-script/village-foodie-v6.57.js`, original `:545-765`. Step by step, from the executing lines:

| step | line | what happens |
|---|---|---|
| inputs | `:553` | `DriveApp.getFolderById(SOURCE_FOLDER_ID)` — folder `1D_v3fOuNqfvfl182PpmBKCvXAwlq-ZwG` |
| | `:558-560` | reads the **Exclusions** set, and the whole **Trucks** and **Venues** tabs into memory |
| time guard | `:550`, `:571` | `TIME_LIMIT = 280000` (280 s, inside Apps Script's 6-minute ceiling); on expiry it **breaks and leaves the rest for the next run** |
| date reference | `:565-578` | builds a **14-day** `dayName = DD/MM/YYYY` table from today |
| model | `:596` | `gemini-2.5-flash`, `temperature: 0`, `responseMimeType: 'application/json'`, image inline as base64 |
| retry | `:645-661` | **up to 5 attempts**, retrying only on `429`/`503`, backing off **15 s, 30 s, 45 s, 60 s**; any other error throws |
| exhausted | `:663-666` | logs *"after 5 retries. **Left in Drive folder**"* and `continue`s — 🔴 **the file survives this path** |
| empty reply | `:667-669` | throws *"Gemini returned empty response. The image may have triggered AI safety filters."* |
| filter | `:672-681` | drops rows with no truck name; **exclusion check**; drops empty venue; **invalid-venue list** |
| truck match | `:684-691` | fuzzy against the Trucks tab **name and column-17 aliases**; no match ⇒ new truck, `appendRow` at `:679`, flagged `Yes - New Truck` |
| venue match | `:697-731` | name **and Venues columns N/O/P aliases**, with a village agreement test; no match ⇒ **Google Maps geocode** `:720` and `venuesSheet.appendRow` `:732` |
| write | `:738-741` | 9-column row pushed with `source = "Drive Screenshot"`, `ai_notes = "[📱 Drive]"`; `setValues` to the Events tab; then `mirrorEventsToSupabase(finalRows)` |
| 🔴 **delete** | **`:748`** | **`file.setTrashed(true)`** |
| pacing | `:749` | `Utilities.sleep(15000)` between files |

**The prompt, verbatim** (`:590-613`), assembled by string concatenation:

```
CRITICAL CONTEXT: Today is <today.toDateString()>.
Extract the food truck schedule from this image.

THIS WEEK AND NEXT WEEK DATE REFERENCE — use ONLY these exact dates when you see a day name:
<weekMapping>

CRITICAL DATE RULES:
- ALWAYS use the exact DD/MM/YYYY from the reference above when you see a day name like 'Monday', 'Tuesday' etc.
- The current year is <currentYear>. Never output 2023, 2024, or 2025.
- If a date is written explicitly (e.g. '3rd June') convert it to DD/MM/YYYY using the year <currentYear>.
- If no time is listed, use empty string "". Never use "00:00".
- IMPORTANT: If a venue or day shows as 'Closed', 'N/A', 'TBC', 'No event', 'Unavailable' or similar — skip it entirely. Do not include it in the output.

Date format MUST be "DD/MM/YYYY". Times MUST be "HH:MM".

JSON FORMAT ONLY — no markdown, no explanation:
{
  "events": [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town" }]
}
```

🔴 **It never asks for a postcode.** 🧪 Confirmed in the data, not inferred from the prompt: of all **511** `Drive Screenshot` rows, `ai_notes` takes exactly three values — `[📱 Drive]` (486), `[📱 Drive] | [⚠️ NEW TRUCK]` (21), `[📱 Drive] | [⚠️ TIME CLASH]` (4) — and **0 contain a UK postcode**. *If this proved nothing:* a regex that never matches returns 0 on any input; ruled out because the same pattern finds postcodes in `URL:` rows, which is the basis of §14 of the pipeline manual.

### 🔴 The delete defect, located precisely

🔎 `:748` sits **after both branches** of the `if (validEvents.length > 0) … else …`:

```js
      } else {
        logToSheet("No valid food truck events found in " + file.getName() + ". File trashed.", "WARN");
      }
      file.setTrashed(true);          // ← :748, reached by BOTH paths
```

| outcome | file |
|---|---|
| events extracted | trashed |
| 🔴 **zero valid events** | **trashed** |
| 5 retries exhausted | **kept** (`continue` at `:666`) |
| thrown error | **kept** (caught at `:750`) |

**So the brief is right and the mechanism is narrower than "on failure":** a *successful* call that yields nothing usable — a misread image, an over-aggressive invalid-venue filter, an exclusion hit — **destroys the only copy.** ⚠️ Note it is also the only path with **no dedup**: the same screenshot re-uploaded produces the same rows, and only `discovery_events`' unique index stops duplicates.

---

## 2. The admin surface, and what can actually be verified

🔎 **Admin is three pages** — `app/admin/page.tsx`, `app/admin/outreach/page.tsx`, `app/admin/whatsapp-templates/page.tsx` — and **eight API routes** under `app/api/admin/`.

🔎 **Auth is `verifyAdmin(req)` (`lib/auth/admin.ts:11-32`)**, called at the top of each route: it resolves the Supabase **cookie** session first, falls back to a **Bearer** token when a `NextRequest` is supplied and there is no cookie user (the native shell sends no cookie), then requires `operators.is_admin`. **The gate lives on the route handler, never on a layout.** A new page follows the same shape: a client page that defers to a new `verifyAdmin`-gated route.

### 🔴 The verification limit, stated plainly

🔎 The app manual `:17785`: *"The sole admin is the founder's own account; there is no test credential; minting a session via the [service role] is blocked."*

**What I — or any agent — could prove without a session:**
- ✅ The route's auth **rejects** correctly: an unauthenticated call returns 401/404 and leaks nothing.
- ✅ The extraction is correct, by calling the extractor **directly** with a fixture image and asserting the parsed events — no session needed.
- ✅ Type-check, and that the page's chunk ships the expected code.
- ✅ Every database effect, by reading rows back with the service key **after** he clicks.

**What only Dominic can prove:**
- 🔴 That the page renders, that the file input opens the picker, that the upload completes, and that the events appear — **because the page cannot be reached without an admin session.**
- 🔴 That it works **in the iOS shell**.

⚠️ **The consequence for sequencing is concrete: build it so the parts that can be proven are separable from the part that cannot.** Extraction as a pure function testable from a script; the route testable for refusal; the UI proven only by him. **Nothing below assumes a login.**

---

## 3. 🔴 iOS — this is a web page, not an App Store submission

**Answer: no plugin, no new Info.plist key, no new build, no review.**

🔎 **`capacitor.config.ts:50` — `allowNavigation: [CAP_SERVER_HOST]`**, and the file's own comment records why it exists: Capacitor's iOS policy prefix-matches the full `serverURL` **including its path** (`/app`), so a sibling path would be handed to Safari — but **`allowNavigation` is checked first and matches on HOSTNAME ONLY, so one entry covers every path on that host.** 🔴 **`/admin` is therefore reachable in the shell.** The `/app` in `server.url` is the **entry** path, not a restriction.

🔎 **No camera plugin is installed** — 🧪 the Capacitor packages are biometric-auth, bluetooth-le, keep-awake, android, app, cli, core, ios, local-notifications, network, preferences, push-notifications, status-bar. **None is needed**, because 🔎 the app manual `:21551` records: *"iOS generates it. WebKit raises **its own file-upload panel** for any `<input type="file">` whose `accept` includes `image/*`, and that panel offers Photo Library / Take Photo / Choose File. The sheet is a **system artefact**."*

🔎 **`NSCameraUsageDescription` is already present** (`ios/App/App/Info.plist:45`), added in V11.47 precisely because an `image/*` file input crashed App Review. 🧪 `NSPhotoLibraryUsageDescription` is **absent — and deliberately so**: manual `:17971` records the **Photo Library and Choose File branches as DEVICE-TESTED on the crashing build**, using out-of-process pickers that need no usage description. **Only the camera branch runs in-process and passes through TCC**, and that key exists.

🔎 **Fourteen `<input type="file">` elements already exist** across the admin page, the manage console and the demo modal, **every one accepting `image/*`** — 🧪 including `app/admin/page.tsx:1726-1727` (`accept="image/*,application/pdf"`), which posts multipart to `/api/admin/provision-demo` (`:678-684`). **An admin screenshot upload is the fifteenth instance of a pattern already shipped and already reviewed.**

⚠️ **Two conditions, from the manual's own rule that an inference scoped to one source is a statement about that source:**
1. 🔴 **Do not add a `capture` attribute** — none of the fourteen carries one; that is what keeps the flow on the out-of-process picker.
2. 🔴 **Do not accept `video/*`** — manual `:21563`: *"none accepts `video/*` — which is the only reason no microphone key was needed."*

**Meet those two and this ships as a web deploy.** Break either and it becomes a new binary, a new key and a review — *"a different proposition"*, exactly as the brief puts it.

---

## 4. What already exists

🔴 **Far more than expected. The pipeline is largely built.**

| stage | exists? | where |
|---|---|---|
| **admin multipart upload** | ✅ **yes** | `app/admin/page.tsx:678-684` → `app/api/admin/provision-demo/route.ts:22-58` — `verifyAdmin`, then `req.formData()`, `form.get('file')` |
| **file → Gemini extraction** | ✅ **yes, and it is a schedule extractor** | `app/api/manage/process-schedule/route.ts:32-37` — `arrayBuffer()` → base64 → `extractScheduleEvents({ mimeType, base64 })` |
| **the extractor** | ✅ | `lib/schedule-extract.ts:152` `extractScheduleEvents`, `:118` the Gemini call, `:108` retry wrapper |
| **a 14-day date reference** | ✅ **already in the app prompt** | `lib/schedule-extract.ts:31-37` — *"use this exact table when converting day names to dates. Do not calculate independently"* |
| **invalid-venue list** | ⚠️ **exists but SHORTER** | `lib/schedule-extract.ts:11` — **5 entries** vs the Apps Script's **9** |
| **exclusion check** | ⚠️ **exists with different semantics** | `lib/schedule-extract.ts:17-23` |
| **image storage** | ✅ | `app/api/manage/route.ts:1568` — `supabase.storage.from('truck-media').createSignedUploadUrl(path)` |
| **truck + venue matching, and the write** | ✅ | `app/api/inbound-schedule/route.ts:76` `findVenue`, `:80-103` id resolution, `:107-112` upsert |
| **Gemini from the app** | ✅ five call sites | `lib/schedule-extract.ts`, `lib/menu-extract.ts`, `lib/whatsapp-classifier.ts`, `app/api/manage/process-allergens`, `app/api/manage/geocode` |

🔴 **What is genuinely new is small: an admin page with a file input, a `verifyAdmin`-gated route, and the decision of where the events land.** Everything else is assembly.

🔴 **And the app's prompt is BETTER than the Apps Script's in one respect that matters:** `lib/schedule-extract.ts` has explicit **POSTCODE RULES** and a venue/town/postcode split (*"The Red Lion Belchamp Otten CO10 7BQ" → venue_name="The Red Lion", town="Belchamp Otten", postcode="CO10 7BQ"*). 🧪 The Apps Script path produces **0 postcodes in 511 rows**. **Moving to the app extractor would start capturing postcodes on this path for the first time** — which §14 of the pipeline manual identifies as the field that would make venue matching resolvable. ⚠️ It also adds an **ENRICH** step (knowledge-based inference of missing fields) the Apps Script prompt has no equivalent of — **a behaviour change to decide on deliberately, not to inherit by accident.**

---

## 5. The pipeline end to end, and where events should land

| stage | reuse | note |
|---|---|---|
| upload | ✅ `app/admin/page.tsx:1726` pattern + `verifyAdmin` route | multipart, `accept="image/*,application/pdf"`, **no `capture`** |
| storage | ⚠️ **decide** | `truck-media` exists but is truck-scoped (`${truck.id}/…`). A screenshot has no truck. 🔴 **Storing the file at all is what fixes the delete defect** — see §6 |
| Gemini | ✅ `extractScheduleEvents` | already handles `{ mimeType, base64 }` |
| filters | ⚠️ **must be reconciled** | §6 |
| matching + write | ✅ `/api/inbound-schedule` | |

### 🔴 Send them through `/api/inbound-schedule`, not straight to `discovery_events`

🧪 **The evidence is in the data, and it is stark:**

| path | writes via | rows with a `venue_id` |
|---|---|---|
| **`Drive Screenshot`** (Apps Script) | `/api/inbound-schedule` | **426 of 511 — 83%** |
| `URL:` (the scraper's own mirror) | direct `discovery_events` upsert | **1,133 of 2,952 — 38%** |

🔎 The route resolves `venue_id` with `findVenue` (`:76`) and `discovery_truck_id` by normalised containment (`:80-89`) **before** upserting. The scraper's own mirror writes neither — which is §2.5 of the pipeline manual, the unlinked backlog.

*If this proved nothing:* the two populations differ in age and provenance, so a raw percentage gap could be an artefact. **Ruled out by mechanism, not by the number:** 🔎 the route calls `findVenue` at insert time and the scraper's mirror has no `venue_id` in its payload at all. **The 83% is the route working; the 38% is a hand-run backfill.**

🔴 **So: reuse the route.** Two ways, and the trade is real:

- **(a) HTTP POST to `/api/inbound-schedule` with the shared secret**, exactly as the Apps Script does. **Zero new code in the write path**, and the behaviour is already proven in production. ⚠️ An app calling itself over HTTP, and the secret must be available server-side.
- **(b) Extract the route's enrichment into a lib and call it directly.** Cleaner, no self-HTTP. ⚠️ But it **refactors a route that four producers already depend on** — the Apps Script's two paths, the scraper's Pass B, and this — while none of them can be integration-tested here.

⚠️ **I would ship (a) first and consider (b) later**, because (a) changes nothing that currently works. **Stated as a recommendation, not a decision.**

---

## 6. 🔴 What must not regress

| behaviour | current | 🔴 the risk in the app |
|---|---|---|
| **exclusion check** | `normalizeTruckKey` (strips stop-words **and spaces**) + **containment** `isFuzzyMatch`, applied to the **TRUCK name** | 🔴 `lib/schedule-extract.ts:17` `isExcluded` normalises **keeping spaces** and matches by **substring** — and 🧪 its three call sites (`app/manage/[token]/page.tsx:7525, 7526, 7579`) all pass a **VENUE name**. **Different normaliser, different matcher, different subject.** ⚠️ This is a **THIRD** exclusion matcher: §16.3 records two (scraper Levenshtein vs Apps Script containment); this is the third, and reusing it blind would silently change which trucks are dropped |
| **invalid-venue list** | 9 entries — `closed, n/a, tba, tbc, unavailable, cancelled, no event, no service, none` — matched by `===` **or `startsWith`** | 🔴 `INVALID_VENUES` has **5** and matches by **exact equality only** (`:187`). **Missing `tba`, `no event`, `no service`, `none`, and the prefix match.** A "No event today" cell would pass the app filter and fail the Apps Script's |
| **14-day date reference** | `:565-578`, *"use ONLY these exact dates"* | ✅ equivalent at `lib/schedule-extract.ts:31-37`. **Keep the discipline: the table, and "do not calculate"** |
| **truck matching** | name **+ column-17 aliases**, fuzzy | ✅ `/api/inbound-schedule:80-89` matches `discovery_trucks.name` by normalised containment. ⚠️ **It does NOT consult aliases** — a name the Sheet would match via an alias becomes a new truck |
| **venue matching** | name + **aliases N/O/P** + village agreement | ✅ `findVenue` — a different, better matcher (village agreement + 15 km ceiling). ⚠️ **Different, so the same input can resolve differently** |
| **dedup** | none in this path | ✅ inherited: `onConflict: 'event_date,truck_name,venue_name'` (`:109-111`). **The unique index is the dedup** |
| **pacing / retry** | 5 attempts on 429/503, 15 s backoff, 15 s between files, 280 s guard | ⚠️ `lib/schedule-extract.ts:108` has its own retry. **One image at a time from a browser needs no 15 s pacer**, but a Vercel function has its own timeout — 🔴 **I cannot estimate whether a large image plus Gemini fits inside it** |

### 🔴 And the file on failure

**The current path bins it (§1). The replacement must not.** ⚠️ **Storing the uploaded image before extraction is what makes the whole thing recoverable** — a zero-event result becomes *"nothing found, here is the image, try again or enter it by hand"* instead of a permanent loss. **That is the single biggest behavioural gain of the move, and it is a storage decision, not an extraction one.**

---

## 7. Cost and sequencing

| # | ships | cost | proven by |
|---|---|---|---|
| **1** | **Reconcile the two filter sets** — `INVALID_VENUES` 5 → 9 with prefix matching, and decide which exclusion matcher this path uses | ~1 h | Pure functions: **testable from a script, no session** |
| **2** | Admin page + `verifyAdmin` route: upload → **store the file** → `extractScheduleEvents` → preview the parsed events | ⚠️ **half a day to a day** | Refusal path and extraction testable here; 🔴 **the page itself only by Dominic** |
| **3** | Confirm-and-send: POST to `/api/inbound-schedule` | ~1 h | 🧪 Rows appear in `discovery_events` with a `venue_id` — **readable with the service key after he clicks** |
| **4** | Retire `processFoodTruckScreenshots`: stop the trigger, leave the function | ⚠️ **outside this repo** | 🧪 `Drive Screenshot` rows stop appearing at :30 past the hour |
| **5** | *(later)* extract the route's enrichment into a lib | ⚠️ **cannot estimate** — four dependent producers, none integration-testable here | — |

🔴 **A human-in-the-loop preview between extraction and write is the step that earns the move.** The current path writes whatever Gemini returns and bins the evidence; a preview turns a misread into a correction. ⚠️ It also means **the admin page is not a drop-in replacement** — it is a better process, and the comparison should be made on that basis.

**What I cannot estimate:** whether image + Gemini fits the serverless timeout (needs a real large screenshot); the Apps Script retirement (outside the repo); and anything about how the page behaves in the shell, which only he can see.

**No span of the prompt arrived garbled** beyond the stale manual versions flagged at the top. **No instruction contradicted another.**
