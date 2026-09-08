# Scraper & Discovery Pipeline — Full Audit

**7 September 2026 · diagnose-and-document only · no code changed, scraper not run, nothing committed**

Companion to `docs/scraper-reference-manual.md` (how it works). This records **everything it touches and everything that could touch it**.

**Marking.** 🔎 = source-read. 🧪 = executed (live database, live third-party API, or local module). **UNREAD** = not established; not a description of probable behaviour. Every 🧪 carries a note on what it would look like if it were proving nothing.

---

## 0. WHAT I SEARCHED, SO AN EMPTY RESULT CAN BE JUDGED

Every search below ran over **all file types**, recursively from the repo root, excluding only `node_modules/`, `.next/`, `.git/`, `ios/`, `android/`, and (for consumer sweeps) `.md`/`.sql` hits which were listed separately. 🧪 File-type census of the tree: **661 md, 260 ts, 131 sql, 119 tsx, 10 json, 8 js, 5 mjs, 4 cjs, 3 yml, 5 csv, 4 txt** — the discovery pipeline lives in **`.js`, `.cjs`, `.mjs`, `.yml` and `.sql`**, none of which a `.ts`-scoped grep sees.

| Pattern | Purpose | Hits outside docs |
|---|---|---|
| `discovery_trucks`, `discovery_events`, `'venues'`, `"venues"`, `excluded_terms`, `scraper_run_log`, `inbound-schedule`, `inbound_schedule` | every reader/writer | listed in §C1 |
| `venues!`, `venue_id (`, `venues (` | embedded joins | 2 |
| `discovery/events` | consumers of the public feed | 4 code files |
| `venueLat` | who turns a coordinate into a pin | 6 files |
| `leaflet\|MapContainer\|google\.maps\|mapbox\|@vis.gl` | map libraries | `components/MapView.tsx` only |
| `CSV_URL\|docs\.google\.com\|output=csv\|gviz` | 🔴 **direct Sheet readers in the app** | 3 files |
| `puppeteer\|playwright\|googleapis\|GoogleGenerativeAI\|generativelanguage\|@google/genai` | every browser/AI/Sheets caller | 24 files |
| `Manual Entry\|Drive Screenshot\|Mobile Screenshot` | origin of event `source` strings | run-scraper.js only |
| `apps script` (case-insensitive) | the pipeline that is *not* in this repo | 1 migration comment + 1 scraper comment |
| `create (or replace )?(function\|trigger\|view\|policy)` ∩ `venue\|discovery` in `supabase/` | SQL-layer writers | **none** — no trigger, view or function touches these tables in any committed migration |
| `process\.env\.[A-Z_0-9]+` in `scripts/run-scraper.js` | env census | 11 distinct |
| `BREVO` in `.github/workflows/*.yml` | is the email key wired in CI | **0** |
| `seed\|temperature\|topK\|topP` in `node_modules/@google/generative-ai/dist/generative-ai.d.ts` | determinism knobs the SDK exposes | temperature/topP/topK only — **no seed** |

⚠️ Absence caveat: `gh` is not installed here, so **GitHub Actions run history and the secret store were not searchable at all** (§F).

---

## PART A — EVERY ACTION IT TAKES

### A1. Every external call

All in `scripts/run-scraper.js` unless stated. "Fails how" is what the code does, not what it should do.

| # | Call | Trigger | Sends | Expects | 🔴 Fails how |
|---|---|---|---|---|---|
| 1 | 🔎 **Google Sheets `values.get`** × 4 (`:425-430` via `getTabData` `:378`) | every run, both modes | `${tab}!A2:T` | 2-D array | 🔴 **`catch → return []`** (`:383`). A bad credential, a renamed tab, a revoked share or a wrong `SPREADSHEET_ID` all become **an empty tab and a green run**. See §B2 — this is the single worst failure in the pipeline. |
| 2 | 🔎 **Puppeteer navigation** (`:545`) | per site, Pass A | `page.goto(url, 30s, networkidle2)`; `http:` URLs race a 15 s sleep | a loaded page | `catch → console.log('Navigation warning')` **then scrapes whatever is there** (`:548`). Chrome launched with `--ignore-certificate-errors --disable-web-security` (`:525`). |
| 3 | 🔎 **Strategy DOM reads** (`:259-370`) | per site | scroll/click/frames | `innerText` | `performFrameDump` swallows every frame error and can return `""` **with no message** (`:356-370`). |
| 4 | 🔎 **Local file write** `DEBUG_SCRAPED_TEXT.txt` (`:553`) | any non-manual site with text | last page's text | — | Unguarded `writeFileSync`. Not in `.gitignore` (🧪 grep). Harmless on a runner; on a dev machine it is a stray file in the repo root. |
| 5 | 🔎 **Gemini `generateContent`** — event extraction (`:640`) | per site | up to 150,000 chars + prompt; `modelLite` unless the name contains `howe` (`:632`) | JSON `{events, exclusionsToAdd}` | 3 attempts, 5 s apart, then **throws into the per-site catch** (`:910`) → `❌ AI Failed`, next site. 🔴 **Not recorded anywhere but stdout.** |
| 6 | 🔎 **Gemini `generateContent`** — geocoding (`:1585`) | once per run, if new venues queued | all queued venues in one prompt | JSON array with postcode/lat/lng | Throws → **now re-thrown, run goes red** (fixed 7 Sep). |
| 7 | 🔎 **Gemini `generateContent`** — Pass B extraction (`:1361`) | per due HatchGrab truck | 100,000 chars, `modelHeavy` | `{events:[…]}` | Caught → `recordRunAndLearn(…,'ai_error…')` (`:1374`) → **a row in `scraper_run_log`**. ✅ Findable in SQL. |
| 8 | 🔎 **Sheets `values.append`** Exclusions (`:676`) | when the AI returns `exclusionsToAdd` | one row | — | `catch → console.error`. ⚠️ Called inside a `forEach(async …)` (`:673`) — **never awaited; the process may exit first.** |
| 9 | 🔎 **Sheets `values.append`** Trucks (`:1527`) | new trucks detected | rows A:T | — | `catch → console.error`, run continues green. |
| 10 | 🔎 **Sheets `values.append`** Events (`:1550`) | new events | rows A:I | — | 🔴 **Un-caught inside `main()`** → main's catch → **exit 1**. The only Sheet write that fails loudly. |
| 11 | 🔎 **Sheets `values.append`** Venues (`:1607`) | after geocoding | rows A:L | — | Re-thrown (7 Sep). |
| 12 | 🔎 **HTTP POST `${HATCHGRAB_API_URL}/api/inbound-schedule`** (`:1465`) | per Pass-B truck with events | `{secret, events[]}` | `{ok, inserted, bridged}` | 🔴 **No `res.ok` check.** A 401 (rotated secret) or 500 returns JSON, `result.bridged ?? 0` prints `0 bridged, 0 discovery`, then `recordRunAndLearn` stamps a **success** row with `events_found = N`. **A dead endpoint is indistinguishable from a healthy run in `scraper_run_log`.** |
| 13 | 🔎 **HTTP POST `api.brevo.com/v3/smtp/email`** (`:1116`) | Pass B truck with zero future `truck_events`, ≤ 1 per 14 days | operator email | 2xx | Fire-and-forget; `.catch → console.warn`. 🧪 **`BREVO_API_KEY` is not in either workflow's env → in CI `if (!BREVO_API_KEY) return` (`:1091`) — the empty-schedule email has never been sendable from a scheduled run.** |
| 14 | 🔎 Supabase reads/writes | see A3 | | | |
| — | 🔎 **Inside `/api/inbound-schedule`** (`app/api/inbound-schedule/route.ts`): `sendConfirmationEmail` via Brevo (`lib/email.ts:557`) | per truck with bridged events | "New events found — please review" | | Per-send try/catch; awaited. |

**Not called anywhere in the pipeline** (🧪 grep): Playwright (only Puppeteer), Google Maps/Geocoding API, postcodes.io (the app calls it client-side for the visitor's postcode, `lib/utils.ts:27`; the scraper never does).

### A2. Every website or source it visits

| Source | URL derived from | Per-truck or hard-coded | Ever succeeded? |
|---|---|---|---|
| 🔎 **Truck websites** (Pass A) | Sheet Trucks tab `row[8] \|\| row[6]`; skipped unless a URL or > 10 chars of instructions (`:461-478`) | per row, in the Sheet | 🧪 **Yes.** `discovery_events` rows created **2026-09-06 10:24 UTC** with `source = "URL: https://www.facebook.com/… \| Strategy: scroll_lazy"` etc. 409 of the 669 future events carry a `URL:` source. |
| 🔎 **Venue websites** (Pass A) | Sheet Venues tab `row[9]`, must start with `http` (`:483`) | per row | UNREAD which venue rows carry URLs. |
| 🔎 **`manual` / `manual_single`** (no page load) | Sheet instructions text | per row | 🧪 Yes — 231 future events with `source = 'Manual Entry'` (`:878`). |
| 🔎 **HatchGrab truck `schedule_url`** (Pass B) | `trucks.schedule_url` where `scraper_preference in ('auto','both')` (`:1160-1170`) | per operator truck, in the database | 🧪 Yes — 3 enrolled (`pizzeria-gusto`, `village-spice`, `test-truck`), all ran **2026-09-07 05:31-05:32 UTC**, all `unchanged_text; healthy_skip`. Last row Pass B *inserted* into `discovery_events`: **2026-09-01**. |
| 🔎 **hatchesup.co.uk** | hard-coded `TARGET_URL` in `scripts/seed-hatchesup-trucks.js:14`; per-truck URLs in `data/hatchesup-trucks.json` | hard-coded | 🔎 Workflow comment: all 36 entries processed by 9 June; cron off since 2 Sep. |
| 🔴 **The Google Sheet itself, as published CSV** | hard-coded in `app/trucks/[slug]/page.tsx:6` (gid 28504033) and `app/venues/[slug]/page.tsx:6` (gid 1190852063) | hard-coded | 🔎 Read on every public truck/venue profile render, for name/logo/photo metadata. **Not a scraper input — a production dependency of the public site on the Sheet.** Failure → `null` → generic `<title>` (`:11-32`). ⚠️ `trucks/[slug]` splits on bare commas (`:16`) — a quoted name containing a comma mis-parses. |
| 🔎 **`Drive Screenshot` / `Mobile Screenshot`** | — | — | 🧪 **29 future events carry these sources and nothing in this repository produces the strings.** They come from the Apps Script pipeline — UNREAD. |

### A3. Every write to the database

🧪 Column photograph via PostgREST capability probes (`information_schema` is not reachable through PostgREST; a `select <col> limit 0` returns 42703 for a missing column — a failing probe would show as an `ERROR` entry, and none did except the two deliberately-tested absences):
`discovery_events` has `venue_id, discovery_truck_id, show_on_vf, show_on_hg, visibility, source, created_at` and **no `postcode`**; `discovery_trucks` has `excluded, show_on_vf, show_on_hg, visibility, exclude_reason, hatchgrab_truck_id, aliases`; `venues` has `latitude, longitude, postcode, created_at` and **no `source`**; `scraper_run_log` has `notes`; `excluded_terms` has `truck_id`.

| Table | Where | Operation | Conflict key | Awaited? | Evidence it lands |
|---|---|---|---|---|---|
| `excluded_terms` | `:688` | upsert `{term}` | `term`, `ignoreDuplicates` | 🔴 **No** (`.then`) — and inside a non-awaited `forEach(async)` | 🧪 **0 rows in the table.** Either never triggered or never landed — UNREAD which. |
| `discovery_trucks` | `:1536` | upsert `{name, exclude_reason:'Yes - New Truck'}` | **`name`**, `ignoreDuplicates` | 🔴 **No** (confirmed) | 🧪 12 rows carry the exact stamp; latest **2026-08-09**. So this write *does* land when reached. ⚠️ Whether a unique index on `name` exists: UNREAD (migration creates a plain index only, `20260522:62`); the landed rows imply one was added by hand. |
| `discovery_events` | `:1568` | upsert, batches of 100 | `event_date,truck_name,venue_name` | 🔴 **No** (confirmed) | 🧪 811 rows created in the last 30 days, latest 2026-09-06. **Lands.** Therefore a matching unique index exists — settles the manual's UNREAD. |
| `venues` | `:1657` | upsert | `name,village`, `ignoreDuplicates` | ✅ Yes (7 Sep) | 🧪 **Last venue created 2026-06-11.** Never landed under the old key. |
| `trucks` | `:1000`, `:1032`, `:1304`, `:1428`, `:1445`, `:1476`, `:1124` | update (last-run, learned day, rule, hashes, notify stamp) | — | ✅ | 🧪 `scraper_last_run_at` = 05:31 today on all three. |
| `scraper_run_log` | `:1004` insert, `:1058` insert, `:1142` delete (< 90 d) | | — | ✅ | 🧪 406 rows, 57 in the last 7 days. |
| **via `/api/inbound-schedule`** `discovery_events` | route `:105` | upsert **with** `venue_id`, `discovery_truck_id`, `show_on_*=true` | same key, `ignoreDuplicates:false` (updates) | ✅; error → 500 | 🧪 106 rows with `source like 'hg_scraper%'`. |
| **via `/api/inbound-schedule`** `truck_events` | route `:215` | insert `status:'unconfirmed', source:'scraper'`, coords + `venue_id` + confidence from `findVenue` | — | ✅ | 🧪 **0 future rows with `source='scraper'` today.** |

**One-off scripts that also write these tables** (🔎 headers; not on any schedule): `scripts/migrate-from-sheets.cjs` (venues upsert on **`name`** — would 42P10 today), `scripts/import-hatchesup-schedule.js` (`discovery_trucks` on `name` with overwrite; `discovery_events` on the 3-column key with overwrite), `scripts/process-next-truck.js` (`discovery_trucks` on `name`, **overwrites `menu_url`/`order_url`**). 🧪 The three `discovery_trucks` rows created 2026-09-03 (`A Good Egg`, `3Bros Burgers`, `Amen Catering`) carry `exclude_reason = null`, so they came from one of these or the admin/outreach routes — not the scraper.

**Fire-and-forget census — confirmed three, not two:** `:688` (`excluded_terms`), `:1536` (`discovery_trucks`), `:1568` (`discovery_events`). Plus the Brevo POST at `:1116`.

---

## PART B — EVERY CONNECTION AND CREDENTIAL

### B1 / B2. Services, credentials, and whether anything would tell us

| Service | Used for | Credential | Lives in | 🔴 Silent expiry looks like | **Would anything tell us?** |
|---|---|---|---|---|---|
| **Google Sheets API** | site list, matching data, dedup set, 4 appends | `GOOGLE_SHEETS_CREDENTIALS` (service-account JSON) + `SPREADSHEET_ID` | GitHub secrets; `.env.local` | 🔎 `getTabData` returns `[]` on any error. Run logs `Loaded 0 existing unique events`, scrapes **0 sites**, appends nothing, **exits 0**. | 🔴 **NO.** Nothing distinguishes "credential dead" from "quiet day". A run that scrapes zero sites is green. |
| **Google Sheets (published CSV)** | public truck/venue page metadata | none (public link) | hard-coded URLs | Unpublishing the sheet → `null` → generic titles | 🔴 No. |
| **Gemini** | 3 prompts (extract, geocode, Pass B) | `GEMINI_API_KEY` | GitHub secrets; `.env.local`; also Vercel for the app's own routes | 🔎 Startup throw only if the var is **absent**. If present-but-revoked: Pass A logs `❌ AI Failed` per site and **exits 0**; Pass B writes `ai_error` rows. | ⚠️ **Pass B: yes, in SQL** (`notes like 'ai_error%'`). **Pass A: no.** |
| **Supabase** | all DB reads/writes | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | GitHub secrets; `.env.local` | 🔎 Pass B's truck read **throws** (`:1172`) → red. Pass A's three mirrors → `console.warn` on a promise nobody awaits → green. | ⚠️ **Pass B: red run.** **Pass A: no** — that is the three-month shape. |
| **HatchGrab `/api/inbound-schedule`** | Pass B hand-off | `INBOUND_SCHEDULE_SECRET` (+ `HATCHGRAB_API_URL`) | GitHub secrets; Vercel env (route side `:27`); `.env.local` | 🔎 Missing → **throws** (`:1497`). **Rotated on one side only → 401 JSON → logged as `0 bridged`, success row written.** | 🔴 **No.** `scraper_run_log` shows `events_found = N`, `notes = null` — a healthy row. |
| **Brevo** | two operator emails | `BREVO_API_KEY` | `.env.local`, Vercel; **not in the scraper workflows** | 🔎 `if (!BREVO_API_KEY) return` | 🔴 No — and it is already in that state in CI. |
| **GitHub Actions** | the runtime | `GITHUB_TOKEN` (process-next-truck only) | GitHub | 🔎 A red run emails the repo owner (GitHub default — UNREAD whether notifications are on). A **green** run that did nothing emails nobody. | ⚠️ Only for the throw paths listed in B3. |
| **Chrome** | Puppeteer | `PUPPETEER_EXECUTABLE_PATH` from `browser-actions/setup-chrome` | workflow step output | Launch failure throws → red. | ✅ |

### B3. Every environment variable the scraper reads (🔎 census of `process.env.*`, 11 distinct)

| Var | Line | Absent → |
|---|---|---|
| `GOOGLE_SHEETS_CREDENTIALS`, `GEMINI_API_KEY` | `:410` | 🔴 **Loud** — throws `Missing Credentials in .env.local` |
| `SPREADSHEET_ID` | `:30` | 🔴 **Quiet** — every tab read fails into `[]`; run is green with 0 sites |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `:17-18` | ⚠️ Pass B loud (truck read throws); Pass A quiet (mirrors warn) |
| `HATCHGRAB_API_URL`, `INBOUND_SCHEDULE_SECRET` | `:925-926` | ✅ **Loud** in hatchgrab mode (`:1497`); ignored in discovery mode |
| `BREVO_API_KEY` | `:927` | 🔴 Quiet — email silently skipped. 🧪 Absent from both workflows today. |
| `SCRAPE_MODE` | `:398` | ⚠️ Quiet — **unset = BOTH passes**. A local run with no mode is a full production scrape. |
| `SCRAPE_TRUCK_ID` | `:407` | Optional. ⚠️ `daily_scrape.yml` exposes it as a dispatch input, but in `discovery` mode Pass B never runs, so it does nothing there. |
| `PUPPETEER_EXECUTABLE_PATH` | `:14` | Quiet — falls back to bundled Chrome (correct locally). |

🧪 Locally `.env.local` holds all of these except `SCRAPE_MODE`, `SCRAPE_TRUCK_ID`, `PUPPETEER_EXECUTABLE_PATH` (names only were checked). `HATCHGRAB_API_URL` points at `https://hatchgrab.com`. 🔴 **So `node scripts/run-scraper.js` on this Mac is a full production run against the live Sheet, live Gemini and the live database.**

---

## PART C — EVERY ENDPOINT AND SURFACE THAT CONSUMES ITS OUTPUT

### C1. Every reader of `discovery_trucks`, `discovery_events`, `venues` (🧪 all-extension grep; 🔎 each read)

| Surface | Reads | Filters on | Discards |
|---|---|---|---|
| **`app/api/discovery/events/route.ts`** — the public feed | `discovery_events` + joins `discovery_trucks!discovery_truck_id`, `venues!venue_id`; `discovery_trucks` twice more | `show_on_vf` or `show_on_hg` by host (`:71-74`); `event_date >= today`; `.limit(1000)` | truck `excluded` (`:148`); truck's own `show_on_*` false (`:151`); orphan events recover their truck **by normalised name** (`:141`); **on HatchGrab hosts every discovery event is dropped** (`:318`, `isHG ? []`) |
| `app/api/inbound-schedule/route.ts` | `discovery_trucks (id,name)`, `venues (id,name,village,lat,lng,postcode)`, `discovery_trucks` linked | secret; `scraper_preference !== 'manual'`; reject-memory; same-day dedup | |
| `app/api/admin/outreach/route.ts:41` | `discovery_events (truck_name, event_date)` paged | name/alias match, not FK | — |
| `app/api/admin/route.ts:46,87` | `discovery_trucks` list; updates `show_on_*`, `excluded`, `visibility` | admin auth | — |
| `app/api/admin/create-truck/route.ts`, `create-operator/route.ts:97` | `discovery_trucks` link / **shadow-exclude by `ilike(name)`** | | |
| `app/api/admin/outreach/route.ts:238` | writes `discovery_trucks.phone/contact_email` | | |
| `app/admin/page.tsx`, `app/admin/outreach/page.tsx` | via the above | | |
| `app/venues/[slug]/VenueClient.tsx:16`, `hooks/useVillageData.ts:34`, `app/page.tsx` | **`/api/discovery/events`** (client fetch, 10 s abort, 3 attempts) | client-side date/distance/cuisine | see C2 |
| `app/venues/[slug]/page.tsx`, `app/trucks/[slug]/page.tsx` | 🔴 **the Google Sheet CSV**, not the database | slug match | |
| `scripts/backfill-venue-id*.ts`, `scripts/reresolve-event-venues.ts` | `discovery_events`/`venues`/`truck_events` | emit-only / manual | |
| **Not readers:** `app/api/embed/events/route.ts` (deliberately `truck_events` only, `:14`), `lib/truck-logo.ts` (comment only — no longer queries `discovery_trucks`) | | | |

### C2. 🔴 What the public map actually renders — traced backwards

🔎 `components/MapView.tsx:144` — a pin exists only for an event where **`event.venueLat && event.venueLong`** are truthy; events sharing a coordinate pair are grouped into one marker.
↑ receives `verifiedMapEvents` from `app/page.tsx:76-83`: `mapEvents.filter(e => e.source === 'operator' || isEventVerified(e.truckName))`.
↑ `isEventVerified` (`:64-73`): the truck name, washed, must be **exact or Levenshtein ≤ 1** to a name in `allTrucks` whose `exclude` string **does not contain the letter `y`** (`:57-60`) — 🔴 a legacy predicate on `exclude_reason`, applied client-side, in addition to the server's `excluded` boolean.
↑ `mapEvents` from `hooks/useVillageData.ts`: **date filter only** (default `'all'` = next **14 days**, `:87-90`) plus cuisine. 🔴 **The distance filter does not apply to the map** (`:122-130` gates the list only).
↑ `events` = the JSON of **`/api/discovery/events`** (`:34`), `cache: 'no-store'`, bounded retry, honest `loadError`.
↑ the route: `venueLat = venue.latitude ? parseFloat(…) : undefined` (`:163`) where `venue` is the **`venues!venue_id` join** — for a discovery event there is **no other coordinate source**. For an operator event the coordinates come from `truck_events.latitude/longitude` (`:280`).
↑ `discovery_events.venue_id` — 🧪 **69 of 669 future rows non-null (10.3%)**, across **29 venues**. 🔎 **Pass A never sets it** (`:1556-1566`); only `/api/inbound-schedule` (Pass B) and the hand-run backfill do.

**So, counted from the pin backwards:** a scraped event is on the map iff (its truck row is not `excluded` and `show_on_vf`) ∧ (the truck's `exclude_reason` has no `y`) ∧ (name within 1 edit of a listed truck) ∧ (date ≤ 14 days by default) ∧ **(venue_id set ∧ venue has coordinates)**. The last conjunct is the one 90% of rows fail.

🧪 **The coordinates behind the 69 pins were validated** (§D3): 14 of the 29 venues have a postcode; 2 sit **6.8 km** from their own postcode (Wylde Sky Brewery / Linton; The Lion / Ickleton — whose stored value is the placeholder pair `52.1234, 0.1234`), the rest ≤ 2.1 km.

🧪 **What is invisible everywhere:** 0 future events have a truck with no `discovery_trucks` row by FK or name (the route's `{}` fail-safe drops none today).

### C3. What the operator side reads, and whether a scraper defect can reach a trading truck

🔎 **Pass A cannot reach a HatchGrab public surface.** The feed drops all discovery events on `hatchgrab` hosts (`route.ts:318`); embeds read `truck_events` only.

🔎 **Pass B can, by three routes:**
1. **`truck_events` inserts** (`inbound-schedule:215`) for a linked truck with `scraper_preference ≠ 'manual'`: `status:'unconfirmed'`, **latitude/longitude/venue_id/postcode taken from `findVenue`'s match — including `'low'`-confidence matches** (`:229-232`). The operator approves in Manage; 🔎 approval (`app/api/events/action/route.ts:99-110`) sets `confirmed` and **does not touch coordinates**. 🧪 `venue_match_confidence` is written by exactly one file and **read by none** — the operator never sees that a pin is a guess. Once confirmed, the event and its coordinates are public on HatchGrab and Village Foodie (`route.ts:280`). **A 30-mile mislink therefore reaches a trading truck's public pin through an approval screen that does not show it.** 🧪 0 future `source='scraper'` rows exist today, so the path is armed but empty.
2. **Emails to the operator**: "New events found — please review" (`inbound-schedule:245`) and "No upcoming events showing" (`run-scraper.js:1073`). Scraper junk becomes customer-facing mail. The second is currently unsendable from CI (§B).
3. **Read-through profile fill** (`route.ts:231-245`): an operator truck's listing borrows `logo_url, photo_url, cuisine, phone, mobile, accepted_methods, website, menu_url` from its **linked** `discovery_trucks` row when its own field is empty. The scraper never sets `hatchgrab_truck_id`, but `process-next-truck.js:116` **overwrites `menu_url`/`order_url` on a name match** — a one-off script, cron off.

🔎 **Graduation is name-based**: `create-operator:97` excludes the shadow by `ilike(name)`; the feed's orphan fallback is also by normalised name. A scraper-created row with a near-miss spelling is neither excluded nor deduplicated against the operator's events (`route.ts:305-320` dedups by normalised truck+date+venue).

---

## PART D — THE GEMINI GEOCODER

### D1. Exactly what is sent and what comes back

🔎 `run-scraper.js:1585-1590`, model `gemini-2.5-flash-lite`, `temperature: 0`, `responseMimeType: 'application/json'` (`:494-497`):

```
You are a UK Geography data assistant. Find the Postcode, Latitude, and Longitude for these locations.
Only return a valid JSON array.
Locations: Name: "<name>", Village: "<village>", Hints: "<event notes>" | Name: … | …
Format: [{ "name": "Exact Name Provided", "village": "Exact Village Provided", "postcode": "XX1 1XX", "lat": 52.123, "lng": 0.123 }]
```
All queued venues go in **one** prompt. What comes back is parsed by `generateContentWithRetry` (strip fences, `JSON.parse`) and used **directly**: `latitude: v.lat || null, longitude: v.lng || null` (`:1657-1662`). 🔴 **The model is asked to *find* coordinates from its own knowledge — there is no lookup, no map API, no postcode database.**

**Validation before it becomes a pin:** 🔎 **none.** No bounds check, no UK check, no type check (`v.lat` could be a string and would be stored as-is or rejected by `numeric` — UNREAD which), no confidence field, no cross-check of postcode against lat/lng.

### D2. 🔴 Does the same input give the same coordinates?

**What the settings say:** 🔎 `temperature: 0`. 🧪 The SDK's `GenerationConfig` exposes `temperature/topP/topK` and **no `seed`** (`generative-ai.d.ts:682-684`). Temperature 0 makes decoding greedy; Google does not document it as a determinism guarantee, and a model revision or serving change can alter output. **The settings alone do not settle it.**

**What execution showed:** 🧪 The scraper's exact prompt shape, model and config, sent **4 times** for `The Bull / Great Paxton`, `The Plough / Great Shelford`, `Village Hall / Stambourne` — **12 answers, all byte-identical across runs.** Failure mode if this were proving nothing: 4 calls seconds apart share a model revision; this establishes *stability now*, not stability across weeks or model updates. A divergence would have been conclusive; agreement is only consistent with stability.

**Plainly:** on the evidence, **the same venue asked twice today returns the same coordinates.** Skip-on-conflict is therefore **not protecting against drift; it is freezing the first answer.**

**And the first answer is often not a location at all.** 🧪 The three probe answers:
- `The Bull, Great Paxton` → postcode **PE4 7EY**, lat/lng **52.3456, 0.2345**. postcodes.io: PE4 7EY is **Peterborough**, 52.61 / −0.24 — the wrong town, and the model's longitude has the **wrong sign** (Great Paxton is west of Greenwich). The village's real postcodes are PE19 6xx.
- `The Plough, Great Shelford` → **CB22 5LD**, **52.1234, 0.1234**. The postcode is real and in Great Shelford; the coordinates are the format example's placeholder digits.
- `Village Hall, Stambourne` → **CO9 2ND** (🧪 **not a valid postcode**), **51.9876, 0.5678** — placeholder digits.

🧪 **The same pattern is in production.** Of 573 venues with coordinates, **26 carry a placeholder-pattern fraction** (`…1234`, `…5678`, `…9876`, `…2345`, `…8765`, `…3456`): e.g. *Sweffling Hut/Village Hall* `52.1234, 1.5678`, *The Lion (Ickleton)* `52.1234, 0.1234` (**one of the 29 venues currently pinned**), *Stradbroke Community Centre* `52.3456, 1.3456`. **13 venues sit at exactly `55.378051, −3.435973` — the centroid of Great Britain**, among them *Private Event*, *Your Mums House*, *Latitude Festival*, *Wilderness Festival* (16 historical events linked, 0 future). Failure mode of the pattern test: a real coordinate can end in `1234` by chance — but 26 of 573 with these six sequences is not chance, and the centroid cluster is unambiguous.

### D3. Every guard between a Gemini answer and a stored coordinate

| Stage | Guard | Status |
|---|---|---|
| Gemini → `geoResult` | JSON parses | ✅ (else throw) |
| `geoResult` → `venues` row | name present; village present (from the queue) | ✅ since 7 Sep |
| lat/lng | **bounds, UK bounding box, sign, type, precision, postcode↔coordinate agreement** | 🔴 **none** |
| existing row | `ignoreDuplicates` — a re-run **never corrects** a stored value | 🔴 freezes the first answer |
| `venues` → event pin (Pass A) | — | 🔴 no link is ever made; a linker is a separate manual tool |
| `venues` → event pin (Pass B / backfill) | `findVenue` token overlap → village agreement → **best-pick on ambiguity, stamped `'low'`** | ⚠️ never bails to null when candidates exist (`lib/venue-matcher.ts:92-103`); confidence written, **never read** |
| pin → map | `venueLat && venueLong` truthy | ✅ (a `0` coordinate would be dropped; a wrong one is drawn) |

🧪 **How wrong the stored coordinates are** — 200 most-recent venues with both a coordinate and a postcode, each compared with postcodes.io's centroid for **the postcode the same model supplied**: 10 postcodes invalid; of the 190 valid, **p50 1.1 km, p75 3.2 km, p90 10.3 km, max 76.8 km**; **73 > 2 km, 21 > 10 km, 1 > 30 km** (*Hinchingbrooke House* stored near Cambridge, postcode in Boston). A recognisable class: **longitude sign flipped near the meridian** — three *Trumpington* rows and *Honeywell House*, *The Cavendish School* all stored at ≈ −0.11 against a real +0.11, i.e. ~15 km west. Failure mode of this measurement: it compares two Gemini outputs with each other, so a postcode and coordinate that are *both* wrong in the same direction would pass; and rural postcode centroids can legitimately sit 1–2 km from a venue, which is why the >2 km and >10 km lines are the ones to read.

**Where the 30-mile risk lives, precisely:** (a) in the geocoder itself — sign flips and fabricated values, unguarded; (b) in `findVenue`'s best-pick over same-name venues in different villages (🧪 among the 600 unlinked future events, **557** have an exact-normalised-name `venues` row and **36 of those names are ambiguous** — *The Bull*, *The Plough* class); (c) in `ignoreDuplicates`, which keeps (a) forever.

---

## PART E — WHAT COULD GO WRONG AND NOT BE NOTICED, RANKED

| Rank | Failure | What breaks | Outside symptom | What would catch it |
|---|---|---|---|---|
| **1** | 🔴 **Sheet credential / share / ID dies** — `getTabData → []` | Pass A scrapes nothing; matching, exclusions and dedup all empty | Map slowly empties over ~14 days as events age out; nothing else | A hard failure when any of the four tabs returns 0 rows, or when `sitesToScrape.length === 0`; a run-summary row (`scraper_run_log` has no Pass-A row type today) |
| **2** | 🔴 **`inbound-schedule` secret rotated on one side** | Pass B extracts, POSTs, gets 401, logs `0 bridged`, writes a **success** row | Trading trucks stop receiving "new events" emails; scraped events stop appearing as unconfirmed | `if (!res.ok) throw` at `:1465`; a `notes` reason on non-2xx |
| **3** | 🔴 **Wrong coordinates approved for a trading truck** (low-confidence match or fabricated venue coordinate → `truck_events` → confirmed) | A real truck's public pin is in the wrong place | Customers go to the wrong village; the operator sees a correct venue *name* and never a map | Show `venue_match_confidence` and a mini-map in the approval UI; refuse to stamp coordinates on `'low'` |
| **4** | 🔴 **Pass A `discovery_events` mirror stops landing** (index change, column rename, RLS, key expiry) | Sheet keeps filling; DB stops; identical to the venue outage | "Few trucks on the map", weeks later | Await the upsert; throw on error (the venue fix, applied to `:1568` and `:1536`) |
| **5** | ⚠️ **Gemini key revoked with Pass A running** | Every site logs `❌ AI Failed`, exit 0 | Same as 1 | Count AI failures; fail the run above a threshold |
| **6** | ⚠️ **Geocoder writes a placeholder / centroid / sign-flipped coordinate** | Venue frozen wrong for ever | A pin in Peterborough or the Scottish Borders | A UK bounding box (49.8–60.9 N, −8.7–1.8 E), a "fraction matches `1234/5678/…`" reject, and a postcode↔coordinate agreement check against postcodes.io **before** insert |
| **7** | ⚠️ **A newly discovered truck is not actually excluded at the DB level** | 🔎 The scraper writes `exclude_reason:'Yes - New Truck'` but **never `excluded:true`**; the boolean was backfilled once (`20260703` migration) | 🧪 **5 such rows exist today with `excluded=false, show_on_vf=true`** (`Katsu Later`, `Wintringham`, `Jason Willis`, `Gnawty Bites`, `Ice Cream`). Their events would **list** on Village Foodie (the `y`-predicate only guards the *map*); 🧪 they have 0 future events today, so nothing is leaking *now* | Write `excluded: true` alongside the reason at `:1537`; drop the legacy `exclude.includes('y')` client gate once done. ⚠️ **This corrects the manual's §7.2 item 5, which said a new truck is invisible until cleared — that is true only of the map pin, and only via the legacy predicate.** |
| **8** | ⚠️ **Venues tab strategy column polluted** | `newVenueRows[11] = '[⚠️ NEW FROM SCRAPER]'` lands in **column L = the venue `strategy` column** (`:1600`, read at `:486`) | If a URL is later added to such a row it silently runs `scroll_lazy` regardless | Move the marker to an unused column |
| **9** | ⚠️ **Local run with no `SCRAPE_MODE`** | Full production scrape from a laptop | Duplicate appends, surprise Gemini spend | Default to no-op unless `SCRAPE_MODE` is set |
| **10** | ⚠️ **Brevo key missing in CI** | Empty-schedule nudge never sends | Nobody notices an operator with no events | Add the secret, or remove the feature from the scraper |

**Recommendations (not implemented):** (1) make the three fire-and-forget writes awaited-and-throwing; (2) fail the run on `sitesToScrape.length === 0` or any tab read error; (3) check `res.ok` on the inbound POST; (4) guard coordinates before insert and pre-check postcode agreement; (5) replace Gemini geocoding with a postcode lookup (postcodes.io, already used client-side) seeded by the model's postcode only; (6) surface confidence in the approval UI; (7) write `excluded: true` for new trucks; (8) a Pass-A summary row per run in `scraper_run_log` (sites, events, venues, AI failures) so a green run can be read in SQL.

---

## SQL — for things a query settles (run in the Supabase SQL editor; each is read-only)

**Photograph the columns before trusting any name above.**
```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('venues','discovery_events','discovery_trucks','excluded_terms','scraper_run_log','truck_events')
order by table_name, ordinal_position;
```

**Which conflict keys are real (the 42P10 question for every upsert in A3).**
```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('venues','discovery_events','discovery_trucks','excluded_terms')
order by tablename, indexname;
```

**Has any index on those tables ever been used by a write path — and is `venues_name_village_key` NULLS NOT DISTINCT?**
```sql
select i.relname as index, s.idx_scan, s.last_idx_scan, ix.indnullsnotdistinct
from pg_stat_user_indexes s
join pg_class i on i.oid = s.indexrelid
join pg_index ix on ix.indexrelid = s.indexrelid
where s.relname in ('venues','discovery_events','discovery_trucks')
order by s.relname, i.relname;
```

**Is Pass B alive, and what did it do (last 14 days by outcome)?**
```sql
select date_trunc('day', run_at) as day,
       count(*) as runs,
       count(*) filter (where notes is null) as clean_success,
       count(*) filter (where notes like 'unchanged_text%') as unchanged_skip,
       count(*) filter (where notes like 'ai_error%') as ai_error,
       count(*) filter (where notes like 'zero_events%') as zero_events,
       count(*) filter (where notes like 'crash%') as crash,
       count(*) filter (where notes like 'empty_page%') as empty_page
from scraper_run_log
where run_at > now() - interval '14 days'
group by 1 order by 1 desc;
```

**Is Pass A's DB mirror alive (rows created per day, by source class)?**
```sql
select date_trunc('day', created_at) as day,
       count(*) filter (where source like 'URL:%') as url_scrape,
       count(*) filter (where source = 'Manual Entry') as manual_entry,
       count(*) filter (where source like 'hg_scraper%') as pass_b,
       count(*) filter (where source like '%Screenshot%') as apps_script,
       count(*) as total
from discovery_events
where created_at > now() - interval '30 days'
group by 1 order by 1 desc;
```

**The map gap, exactly.**
```sql
select count(*) as future_events,
       count(venue_id) as with_venue_id,
       count(*) filter (where venue_id is not null and v.latitude is not null and v.longitude is not null) as pinnable,
       count(distinct truck_name) as trucks,
       count(distinct truck_name) filter (where venue_id is not null and v.latitude is not null) as pinnable_trucks
from discovery_events e
left join venues v on v.id = e.venue_id
where e.event_date >= current_date;
```

**Placeholder and centroid coordinates in `venues`.**
```sql
select name, village, postcode, latitude, longitude, created_at
from venues
where (latitude = 55.378051 and longitude = -3.435973)
   or split_part(latitude::text, '.', 2) ~ '^(1234|2345|3456|4567|5678|6789|9876|8765)0*$'
   or split_part(longitude::text, '.', 2) ~ '^(1234|2345|3456|4567|5678|6789|9876|8765)0*$'
order by created_at desc;
```

**Coordinates outside a generous UK box.**
```sql
select name, village, postcode, latitude, longitude
from venues
where latitude is not null
  and (latitude < 49.8 or latitude > 60.9 or longitude < -8.7 or longitude > 1.8);
```

**New trucks the scraper flagged but never excluded at the boolean level.**
```sql
select name, exclude_reason, excluded, show_on_vf, show_on_hg, created_at
from discovery_trucks
where exclude_reason ilike '%yes%' and excluded = false
order by created_at desc;
```

**Unlinked future events whose venue name is ambiguous across villages (the best-pick risk).**
```sql
with unlinked as (
  select id, venue_name, village, lower(regexp_replace(venue_name, '[^a-zA-Z0-9]', '', 'g')) as k
  from discovery_events where event_date >= current_date and venue_id is null and venue_name is not null
), vn as (
  select lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) as k, count(*) as n, array_agg(distinct village) as villages
  from venues group by 1
)
select u.venue_name, u.village as event_village, vn.n as candidate_venues, vn.villages, count(*) as events
from unlinked u join vn on vn.k = u.k
where vn.n > 1
group by 1,2,3,4 order by events desc;
```

**Scraped operator events awaiting approval, with the confidence the operator cannot see.**
```sql
select t.name as truck, e.event_date, e.venue_name, e.town, e.venue_match_confidence, e.latitude, e.longitude, e.status
from truck_events e join trucks t on t.id = e.truck_id
where e.source = 'scraper' and e.event_date >= current_date
order by e.event_date;
```

---

## THE TREE

🧪 At the time of writing: branch `main`, `HEAD = 08ac368`, `origin/main = 08ac368`. **0 staged.** **24 modified** (the 23 pre-existing plus `scripts/run-scraper.js` from the 7 Sep venue fix), **78 untracked** (the 72 pre-existing, plus reports written since, plus this file). `git add -A` / `git add .` were not run. Nothing was committed, pushed or deployed. The only files this audit created are `docs/scraper-audit-report.md` and scratchpad probes outside the repo. `docs/scraper-reference-manual.md` was **not edited** — its §7.2 item 5 correction is recorded in §E row 7 above for you to decide on.

Probes run: three read-only Node scripts against the live database (service role, `select` only), four `generateContent` calls to Gemini with the scraper's geocode prompt (no DB, no Sheet), and two bulk lookups against `api.postcodes.io`. No row was inserted, updated or deleted.

---

## WHAT I COULD NOT READ OR VERIFY, AND WHY

- 🔴 **GitHub Actions run history, logs and secret names** — `gh` is not installed on this machine and the Actions log is the *only* place Pass A's per-site failures print. **Whether the last Pass A run had AI failures, navigation warnings or empty pages is unknowable from here.** The 2026-09-06 10:24 UTC `created_at` cluster is the only evidence it ran.
- 🔴 **The Google Sheet's contents** — how many sites it lists, whether the Venues tab has gained rows since June (which would prove the Sheet append succeeded while the DB write failed), the Exclusions tab, and the strategy/instruction columns. All reads go through a service account I did not use.
- 🔴 **Whether unique indexes exist on `discovery_trucks(name)` and `excluded_terms(term)`** — `pg_indexes` is not reachable through PostgREST. `discovery_events`' 3-column index is *inferred* from 811 landed rows; `discovery_trucks(name)` from 12 landed rows; `excluded_terms` has 0 rows and so no inference is possible. The SQL above settles all three.
- 🔴 **Whether `venues_name_village_key` is `NULLS NOT DISTINCT`** — inferred from behaviour (two identical null-village upserts produced two rows on 7 Sep); the definition was not read.
- 🔴 **The Apps Script pipeline** — produces 29 of 669 future events (`Drive Screenshot`, `Mobile Screenshot`) and, per the scraper's own comment at `:1366`, calls `gemini-2.5-flash`. Not in this repository. Whether it creates venues, sets `venue_id`, or shares the same geocoder: UNREAD.
- ⚠️ **Gemini stability across days or model revisions** — only stability *now* was measured (4 calls). No `seed` exists to pin it.
- ⚠️ **Whether coordinates that agree with their postcode are actually right** — the validation compares two Gemini outputs with each other; correlated error passes.
- ⚠️ **What a Gemini answer with a non-numeric `lat` does** on insert into `numeric(10,7)` — not tested (no writes).
- ⚠️ **Whether GitHub emails on red runs are enabled** for this repository.
- ⚠️ **`process-next-truck.js` and `import-hatchesup-schedule.js` bodies** — read for their writes only.
- ⚠️ **The Apps Script "Trucks" sheet column T semantics** beyond `row[19] = 'Yes'` — column headers were not read.
