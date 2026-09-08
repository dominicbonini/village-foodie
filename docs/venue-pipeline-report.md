# The venue & schedule-image pipeline — diagnosis

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file changed, no job or script run, nothing written, nothing deployed.** Reads
only, plus one **write-free** production GET/POST (a geocode that returns coordinates and touches no row).

🔴 **HEADLINE: venue-row creation in the database STOPPED on 11 June 2026 — no `venues` row has been
created since — while discovery events continue to be created daily. The "automatic venue creation on a
new location" you describe is `run-scraper.js:1616` (Gemini geocode → `venues` upsert), and its output to
the DB has been zero for ~3 months. New locations ARE still appearing in events (31 unmatched venue names
in the forward window), so this is "creation stopped", not "nothing needed a new venue".**

---

## 1. Every writer of the `venues` table

**Two writers. No API route or admin page creates venues — confirmed by grep (absence reported as
absence).**

| Writer | File:line | Op | Trigger |
|---|---|---|---|
| 🔴 **Automated venue creation** | `scripts/run-scraper.js:1616` — `.from('venues').upsert({ name, village, latitude, longitude }, { onConflict:'name', ignoreDuplicates:true })` | upsert | Inside Pass A's geocode block (`if newVenuesDetected.size > 0`), run by **`daily_scrape.yml`** cron. The DB mirror of the Sheet's new-venue append |
| One-time migration | `scripts/migrate-from-sheets.cjs:111` | upsert | Manual, historical Sheets→DB migration |

The `latitude`/`longitude` written at `:1619-1620` come from `geoResult` — the geocoding in item 2. New
venues are detected during website scraping at `:861` and geocoded+written only when
`newVenuesDetected.size > 0`.

## 2. The geocoding — it is Gemini, not a maps API

🔴 **The geocoder is Gemini (an LLM), not Google Maps / Nominatim / Mapbox** — grepped for all of those;
none is used for coordinates (absence reported). Two Gemini geocoders exist, and only the first creates
discovery venues:

| Geocoder | Where | Model | Credential | Present in production? |
|---|---|---|---|---|
| 🔴 **Discovery venue creation** | `run-scraper.js:1589` `geoPrompt` → `generateContentWithRetry(modelLite, …)` | `gemini-2.5-flash-lite` | **GitHub Actions secret** `GEMINI_API_KEY` (passed in `daily_scrape.yml:49`) | ⚠️ **UNVERIFIABLE from here** — I can see it is *referenced* in the workflow; I cannot read whether the Actions secret is actually set. The scraper's "deployment" is GitHub Actions, not Vercel |
| Operator event geocoder (separate) | `app/api/manage/geocode/route.ts:32` — direct call to `generativelanguage.googleapis.com/…gemini-2.5-flash?key=${process.env.GEMINI_API_KEY}` | `gemini-2.5-flash` | **Vercel env** `GEMINI_API_KEY` | ✅ **VERIFIED PRESENT AND WORKING** — a live prod POST returned `{lat:52.1759, lng:0.1399, confidence:"high"}` |

🔴 **The distinction matters, and it is exactly the "dashboard vs running deployment" caveat.** The
operator geocoder runs on **Vercel** and its `GEMINI_API_KEY` is confirmed working. The **discovery venue
creator runs in GitHub Actions** with a *different* secret store; its presence there is **not** something I
can check from here. So "Gemini geocoding works in production" is proven for Vercel and **unproven for the
scraper**. The route is write-free (returns coordinates, no DB write) — safe to have tested.

## 3. The schedule-image pipeline — external, not in this repo

🔴 **It is NOT in this repository. It is Google Apps Script, bound to the Google Sheet.** Evidence:
- `run-scraper.js:1366`: *"Apps Script paths also use gemini-2.5-flash — update there separately if
  rotated."* — an explicit reference to Apps-Script code that calls Gemini, living outside this repo.
- The landing page advertises the feature (`app/landing/page.tsx:181`): *"send us the photo you already
  post to Facebook. You just review and confirm."*
- No `.gs` file and no `apps-script/` directory exist in the repo (checked).

**So the entry point, the model call, the extraction, and whether it creates venues itself or hands off —
I cannot read, because the code is not here.** What the repo lets me say: the events it produces land in
the **Google Sheet**, and `run-scraper.js` mirrors the Sheet to the DB; venue creation for a new location
would go through `run-scraper.js:1616`'s geocode-mirror (item 1) — **which has produced nothing since 11
June (§5)**. Whether the Apps Script itself geocodes is unknown. **Reported as: external, unreadable here —
its internals and run history need the Apps Script project + its execution logs, which I do not have.**

## 4. Does each path still run — by evidence

| Path | Still runs? | Evidence (date) |
|---|---|---|
| 🔴 **Venue-row creation (`venues` writer)** | **NO — stopped** | DB: **most recent `venues` row = 2026-06-11** ("Farndons at The Swan"). Zero since. §5 |
| Discovery **event** creation | **YES** | DB: most recent `discovery_events.created_at = 2026-09-03 10:52`; 10-38 rows/day over the last 10 days. Mostly **unlinked** → Pass A's direct write (`:1568`, which sets no `venue_id`), not the inbound-schedule link path |
| `run-scraper.js` (HatchGrab pass) | **YES** | DB: most recent `scraper_run_log.run_at = 2026-09-03 16:49` |
| Operator geocoder `/api/manage/geocode` | **YES** | Live prod POST → **HTTP 200**, real coordinates |
| Schedule-**image** pipeline (Apps Script) | **UNOBSERVABLE** | No DB or repo trace I can attribute specifically to it. **Reported as an observability gap, NOT as proof it stopped** |

🔴 **The gap this exposes: events are still created but venues are not.** Both live in `run-scraper.js`
Pass A, so either Pass A runs and its venue-geocode block (`if newVenuesDetected.size > 0`, `:1575`) is not
firing / silently catching `"Geocoder Failed"`, or the events now arrive by a path that bypasses Pass A's
venue detection (e.g. the Apps Script writing to the Sheet). **Which one requires the scraper's GitHub
Actions run logs (its stdout: "Asking AI to locate N new venues", "Geocoder Failed", "added N new
locations"), which I cannot access.** The DB proves the *outcome* (no venues since 11 June); the *cause*
needs those logs.

## 5. `venues.created_at` over the last 120 days — the number that settles it

| Week of | venues created |
|---|---|
| 2026-05-18 | **523** (the initial Sheets→DB migration) |
| 2026-06-01 | 50 |
| 2026-06-08 | 1 |
| **since 2026-06-11** | **0** |

**Total venues, all time: 574 (573 with coordinates). Most recent created: 2026-06-11 13:05.**

🔴 **Nothing has been created for ~3 months, and this is NOT "still runs but nothing needed a new venue":
new locations DO appear** — the forward window has **31 distinct event venue names with no match in the
`venues` table** (per the prior report's measurement), each a location that should have produced a venue
row and did not. **Venue creation has stopped.**

## 6. Google Sheets dependency — still live

🔴 **The pipeline still depends on Google Sheets. The migration moved historical data; it did not retire
the Sheet.** `run-scraper.js`:
- reads the Sheet every run: `getTabData(sheets, TABS.TRUCKS / VENUES / EVENTS / EXCLUSIONS)` (`:423-426`),
  auth via `GOOGLE_SHEETS_CREDENTIALS` + `SPREADSHEET_ID` (`:410-418`);
- appends new events (`:1552`) and new venues (`:1607`) to the Sheet, then **mirrors** them to the DB
  (`:1568` events, `:1616` venues).

So the DB `venues`/`discovery_events` tables are **mirrors of the Sheet**, and the schedule-image pipeline
(Apps Script) is **bound to that same Sheet**. **If the Sheet→DB venue mirror stopped (or the Sheet's
new-venue append stopped), DB venue creation stops — which is what §5 shows since 11 June.**

---

## What is established, and where the boundary is

**Established by evidence:**
- Venue-row creation into the DB **stopped on 11 June 2026** (§5) — the automated `run-scraper.js:1616`
  path has produced nothing since, despite new locations still appearing in events.
- The geocoder is **Gemini** (§2); on **Vercel** its key is present and working; on **GitHub Actions**
  (where venue creation actually runs) its presence is **unverifiable from here**.
- Discovery **events** still flow (§4); the **image pipeline is external Apps Script** (§3) and unreadable;
  the whole thing still runs **through Google Sheets** (§6).

🔴 **The boundary, stated plainly:** whether the venue-creation *code path* still executes and fails, or no
longer executes at all, and whether the recent events come from Pass A or the Apps Script image pipeline —
those need **the scraper's GitHub Actions run logs and the Apps Script execution logs**, neither of which I
can access. I did not infer a cause past the evidence. **No path was declared dead for want of a trigger;
the one I can prove stopped, I proved from the `venues` rows themselves.**

**Nothing changed. Nothing run. Nothing deployed.**
