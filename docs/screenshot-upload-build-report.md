# Screenshot upload — build report

Replaces the Apps Script's `processFoodTruckScreenshots` (Drive folder + time trigger) with an admin
surface. The Apps Script path is **not** removed and keeps running until its trigger is turned off.

## State

| | START | END |
|---|---|---|
| `discovery_events` | 4300 | 4300 |
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_exclusion_terms` | 143 | 143 |
| `truck_events` | (not taken) | 137 |

Every count is unchanged. **No row was inserted, updated or deleted anywhere.** The end-to-end harness
stops before the write deliberately — see "What was NOT run" below.

`git status --short` at START: 5 modified (`DEBUG_SCRAPED_TEXT.txt`, `app/providers.tsx`, both manuals,
`scripts/run-scraper.js`) + 11 untracked docs. At END the same, plus `app/admin/page.tsx` modified and
three new untracked paths. Nothing was staged, committed or pushed.

## What was built

| Path | Status |
|---|---|
| `lib/admin/screenshot-events.ts` | new — pure core: prompt, parse, filter, payload shaping |
| `app/api/admin/screenshot-events/route.ts` | new — `verifyAdmin` → Gemini → filter → `/api/inbound-schedule` |
| `components/admin/ScreenshotsPanel.tsx` | new — the tab body |
| `app/admin/page.tsx` | modified (+31/−7), the only tracked file touched |

`app/admin/page.tsx` was **clean** at START, so its whole diff is this change and it stages as one unit
under `git add -p`. The four existing uncommitted workstreams were not touched.

### It is a tab, not a route

First built as `/admin/screenshots` with a header link; both are gone. It now follows the Outreach
precedent exactly: `ScreenshotsPanel` mounts when `adminTab === 'screenshots'`. The directory
`app/admin/screenshots/` was deleted rather than left as a redirect — Outreach kept one only because an
existing bookmark pointed at it, and this URL never shipped.

The icon/label ternaries carried a note — *"If a fifth tab arrives, make it a map"*. This is the fifth
tab, so they are now `ADMIN_TABS`, and the `?tab=` validator reads that object instead of repeating the
names, so a tab cannot be reachable by URL but missing from the bar.

It is mounted **inside** the `max-w-6xl` body wrapper, unlike Outreach. Outreach sits outside because its
table needs 1510px against a 1152px cap; the uploader is a single narrow column with the opposite problem.

### No button, and nothing stored

Per instruction, the panel processes on arrival: drop, paste (⌘V) or pick, and each file starts reading
itself. The queue runs **one file at a time** — the route retries only 429/503 and Gemini rate-limits per
project, so firing eight at once turns a slow batch into a failed one.

Storage was removed entirely. The route no longer touches the `truck-media` bucket; the image is read
from the request and dropped when it ends.

**This originally guarded a real defect, and it still does — differently.** The Drive path's
`file.setTrashed(true)` (v6.57 orig :748) sits after *both* branches of its if/else, so a call that
succeeded but yielded zero usable events binned the only copy. Storing server-side was one way to stop
that; it is not the only one. Here **the browser holds the file**: a row that failed, extracted nothing,
or had rows dropped stays in the list and can be dropped again, and the copy is on the admin's own device
throughout. Nothing is ever in one place only.

⚠️ **One judgement call worth your eye.** "Deleted once processed" is ambiguous between the list row and
the stored object. Both readings are honoured: nothing is stored, *and* a row that finished cleanly
(wrote ≥1 event, dropped none, errored not at all) clears itself after 6 seconds. Rows that need a second
look stay. Every row has an ✕ regardless. If you meant *all* rows should vanish, that is a one-line change
to `isClean`.

## Proofs

Run against the **live Supabase project read-only** (SELECT on `discovery_exclusion_terms` and
`discovery_trucks`) and the **real Gemini API** with the real `buildScreenshotPrompt()`. The harness
imports the **compiled** `lib/admin/screenshot-events.ts` — an earlier attempt stripped types with regexes
and died on `parseScreenshotEvents(raw): Partial<ScreenshotEvent>[]`; it is now built with `tsc`, and the
only edit to the emitted JS was rewriting the `@/lib/venue-signature` alias that Node cannot resolve.

### 1. Real screenshot, end to end

`sched-real.png` — a Five Bells board naming Pizza Mondo, Buffalo Joe's, a "Closed" row, Nomadough and
"Quiz Night". 3 events parsed, 3 kept, all with dates, times, village and postcode.

### 2. Zero-event extraction is visible, and the file survives

`sched-none.png` → the model returned `{"events": []}` → 0 parsed, 0 kept. The row is marked *nothing
written* and **stays in the list** with the file still in the browser. This is the branch the Apps Script
binned.

### 3. 🔴 The clean run proved nothing about the filter

`dropped: 0` on `sched-real.png`. That is **not** evidence the filter works — Gemini omitted the "Closed"
and "Quiz Night" rows itself, so no filter code ran. A working filter and a filter that drops nothing
produce byte-identical output here. Both branches were therefore forced directly:

| input | kept | dropped | reason |
|---|---|---|---|
| truck `"tbc"` (a real term) | 0 | 1 | `excluded: truck name matches the term "tbc"` |
| truck `"TBC"` | 0 | 1 | same |
| truck `"tbcs"` | 0 | 1 | same |
| truck `"The tbc"` | 0 | 1 | same |
| **control** truck `"Pizza Mondo"` | **1** | **0** | — |
| venue `"Closed"` / `"CLOSED"` / `"closed for refurb"` | 0 | 1 | `invalid venue name` |
| venue `"TBC"` / `"No Event"` | 0 | 1 | `invalid venue name` |
| **control** venue `"The Five Bells"` | **1** | **0** | — |

The controls matter: without them "the filter works" and "the filter drops everything" look the same.
Mechanism confirmed by printing, not inferred — `normalizeVenue("The tbc") === "tbc"` and
`normalizeVenue("tbcs") === "tbc"`, so those four are exact hits after normalisation, not fuzzy ones.

### 4. False positives against every real truck name

All 231 real `discovery_trucks` names × the real 143 terms. **Four** would be refused:

| truck | `excluded` | by term |
|---|---|---|
| Just Baked by Sophie | false | `justbakedbysophie` |
| The Linton Kitchen | false | `lintonkitchen` |
| Dessert MK | false | `dessertmk` |
| Axle & Hop | false | `axlehop` |

All four are live (`excluded = false`) yet their names are exclusion terms, so this path will not create
events for them. The Apps Script refuses them too (containment subsumes exact match), so this is faithful
to the path being replaced rather than a regression — but it is a real gap in **both**, and it is a data
problem, not a code one.

### 5. The two matchers are not the same rule

I earlier described the Apps Script as using edit distance. It does not: `isFuzzyMatch` (v6.57 :1240) is
equality **or containment**. The route uses `venuesFuzzyMatch` (the scraper's 1-edit rule). Measured over
231 × 143:

- same decision: **223**
- refused **only by the new route**: **0**
- refused **only by the Apps Script**: **8** — Azahar, India Express, Taco Banditos, Hyderabadi Dhaba,
  Wintringham, The Foodie Shack, Dirty Fryer Boys, Bad Boi Burritos

The new rule is a **strict subset**: it never refuses a truck the old path accepted. And the 8 it releases
are mostly an old bug — the term `"dis"` normalises to `"di"`, which under containment blocked *any* truck
name containing "di" (5 of the 8, including India Express and Taco Banditos); `"bad"` took Bad Boi
Burritos. Those were false positives, so the narrower rule is a fix, not a loosening.

## 🔴 A claim I was asked to confirm, which is false

**"Nothing reaches `/manage`, `/dashboard` or `/kds`" — I cannot confirm this, because it is not true.**

No operator-facing *file* was changed; that part holds. But `/api/inbound-schedule`, which this route
writes through, does more than fill `discovery_events`. At `app/api/inbound-schedule/route.ts:212` it
inserts into **`truck_events`** — the operator table — with `status: 'unconfirmed'`, and at `:250` it
**emails the operator** a link carrying their `dashboard_token`.

The gate (`:137-153`) is: the truck name matches a linked truck with a `hatchgrab_truck_id`, and that
truck's `scraper_preference` is not `'manual'`. So **a screenshot naming a linked operator truck will put
unconfirmed events on their dashboard and send them mail.**

This is by design and is exactly what the Apps Script did through the same route — it is not something
this change introduced. But "nothing reaches the operator surfaces" would have been a wrong assurance, so
it is recorded here instead.

## What was NOT run, and what is NOT verified

- **No write was executed.** The harness stops before the POST to `/api/inbound-schedule`. Given the
  bridge above, running it would have emailed a real operator, which is outside what was asked for.
- **The panel has never been seen rendered.** No agent session as an admin is obtainable (V12.6 — you are
  the sole admin), so `verifyAdmin` cannot be satisfied from here and the route was never exercised over
  HTTP. The extraction, filters and payload shaping are proven directly; **the UI and the auth path are
  not.** Treat the layout, the drop zone and the queue as unverified until you open the tab.
- `tsc --noEmit` exits 0 across the project.

⚠️ **A false negative I hit and corrected**, recorded because it is the class the manual warns about:
`grep -n "supabase\." route.ts` printed nothing and looked like proof the client was unused. It was not —
the call is split as `await supabase\n    .from(...)`, so the pattern could not match. A failed grep and a
true negative print the same nothing.
