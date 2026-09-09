# Manual update pass 4 — the extraction comparison and the screenshot build, folded in

**9 September 2026 · DOCUMENTATION.** The only files changed are the two manuals:
`docs/scraper-reference-manual.md` **V1.6 → V1.7** and `docs/reference-manual.md` **V12.6 → V12.7**, plus
this report. **No code, config, migration or script was touched. No database row was inserted, updated or
deleted** — this pass made no database calls at all; every 🧪 figure is carried from the two source reports,
which took theirs read-only. Nothing staged, committed or pushed; `git add` was not run in any form.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ qualified · 🔴 danger.
**Extensions searched:** 🔴 **none scoped.** Every sweep in this pass was `grep -rn -I … .` excluding only
`node_modules`, `.next`, `.git` (and `docs` where stated). `scripts/run-scraper.js` is JavaScript and was in
scope; the app is TypeScript.

**No span of the prompt arrived garbled. No instruction contradicted another.** ⚠️ *"The only files you
change are the two manuals"* and the closing instruction to write this report are the same pairing as prior
passes and were read as scope + deliverable, not as a conflict.

---

## 0. STATE

`git status --short` — **START and END identical**: 6 `M`, 17 `??`. `HEAD` = `9e83a5e`, unchanged. The only
new path at END is this report.

🧪 `git diff --stat` confirms the change is confined to the two manuals:

| file | delta |
|---|---|
| `docs/reference-manual.md` | **+334 / −0** (23,751 → 24,004 lines) |
| `docs/scraper-reference-manual.md` | **+914 / −29** (1,702 → 1,990 lines) |
| `DEBUG_SCRAPED_TEXT.txt`, `app/admin/page.tsx`, `app/providers.tsx`, `scripts/run-scraper.js` | **untouched by this pass** — already modified at START by the four uncommitted workstreams |

**No row counts are reported at START/END because no database call was made.** ⚠️ Stating that plainly
rather than re-querying to produce a reassuring pair of identical numbers: the counts would prove only that
a read I did not need did not write.

---

## 1. 🔴 A — THE UNVALIDATED COORDINATE WRITER, AND THREE MANUAL CLAIMS THAT DESCRIBE CODE THAT DOES NOT EXIST

**Recorded as the highest-priority item in both manuals.** App manual **§51.1**, pipeline manual **§20.5**,
both changelogs, both backlog/UNREAD lists.

🔎 `app/api/manage/geocode/route.ts:16-22` asks Gemini *"You are a geocoding service. Return ONLY a JSON
object with the latitude and longitude…"* — **no postcodes.io lookup, no sentinel test, no distance check,
no `partial_match` check** — and the `confidence` the prompt asks for is **discarded** by the caller
(🔎 `app/manage/[token]/page.tsx:6572-6574`). Three dashboard call sites write it (🔎 `:3384` onboarding,
`:6982` hand-edited event, `:7045` **the schedule-import review save**) → `upsert_event` →
🔎 `app/api/manage/route.ts:838` → **`truck_events.latitude/longitude`**.

🧪 25 of 57 `source='manual'` rows carry them (44%), at a **0% `venue_id`** rate.

### 1.1 The correction went further than the brief asked, because the manual claimed a fallback existed

The brief said to correct any claim that every coordinate comes from postcodes.io. **The app manual made a
stronger claim than that, in two places, and 🧪 all three of its sub-claims are false:**

> **OLD VALUE** (V6.x changelog): *"**Geocoding fallback** — manual events geocode via Gemini with an
> api.postcodes.io postcode fallback; the operator is warned on failure and a Fix button re-geocodes events
> with null coordinates."*

| sub-claim | verdict | evidence |
|---|---|---|
| an `api.postcodes.io` fallback | 🔴 **false** | 🧪 `getCoordsFromPostcode` (`lib/utils.ts:24`) is the app's **only** postcodes.io caller, and its **sole** call site is `app/page.tsx:143` — the **customer's** postcode search on the public map, not the event geocoder |
| the operator is warned | 🔴 **false** | 🔎 `:6988` and `:7049` are `console.warn`. No toast, no UI |
| a Fix button / `update_event_coords` | 🔴 **false** | 🧪 a repo-wide sweep finds `update_event_coords` **only in the manual itself**. The event actions are `upsert_event`, `delete_event`, `update_event_deal`, `get_recent_events`; the "Fix" control at `:8044` is about missing **times and vans** |

⚠️ **I checked for a renamed equivalent before asserting the third**, because "the action was renamed" and
"the action never existed" print the same nothing — 🧪 enumerating every `action === '…event…'` in the manage
route returned four names, none of them coordinate-related.

**Both sites corrected in place with the old value struck through and quoted** (the V6.x changelog entry and
§15's body).

### 1.2 The pipeline manual's narrowing was itself too narrow — corrected a second time

- **V1.1:** *"Every coordinate now comes from postcodes.io or the venue is stored with none."*
- **V1.4 narrowed it:** *"true of the scraper only… and false of this script [the Apps Script]."*
- 🔴 **V1.7 narrows it again:** that named **two** writers and implied the class was otherwise clean.
  **There is a third, in the app, operator-facing.** Corrected in place at **§16.7** and at the V1.1
  changelog line, both quoting the prior value.

---

## 2. B — THE EXTRACTION LANDSCAPE, IN BOTH MANUALS

New **§20** (pipeline) and **§51.2–51.4** (app). Six paths, eight prompt sites, each with its file location,
what it fetches and where it writes: **A** discovery events `run-scraper.js:1230`; **B** discovery *rules*
`:1198`; **C** HatchGrab loop `:2075`; **D** operator file/text and **E** operator URL, both
`lib/schedule-extract.ts:25`; **F** admin screenshot `lib/admin/screenshot-events.ts:103`; **G/H** the two
Apps Script paths. ⚠️ **E was routinely omitted from the "three paths" framing**; ⚠️ **D and E write nothing
themselves** — they return events to the browser.

### 2.1 🔴 The central finding, recorded as the reason prompts need an owner

🧪 **A: 1,100 of 2,952 rows carry a postcode (37%). C: 0 of 108 (0%).** Same model, **same file**, same
Puppeteer capture, same database. 🔎 The material difference is A's rule 7 — *"Postcodes, addresses, or extra
event details go into the `Notes` field"*.

**Every structural variable is held constant, so none of them explains the gap.** Both manuals record the
consequence: **prompts must be treated as data with one owner and a version**, because a consolidation that
unifies routes and leaves eight prompt strings scattered has consolidated the half that was not costing
anything.

⚠️ **Carried forward as OPEN, not as settled:** if C's pages contain no postcodes, 0% is a property of the
input. **Checkable from the already-logged page text; not checked.**

### 2.2 What must not be merged

- 🔴 **`scrape_rules` (B)** — 🔎 `:1198` emits `freq`/`day`/`startDate`/`endDate`, a recurring **rule**;
  🔎 `ExtractedEvent` has no field for any of them. **Not convertible without inventing dates, which is what
  a rule exists to avoid. A rule compiler, not an extractor.**
- ⚠️ **Per-site `ai_instructions`** — 🧪 **30 sites carry hand-written prose rules**, injected at 🔎 `:1201`
  and `:1236`. **No other path has anything like them, and no surface exists for writing one.**
- ⚠️ **The six-strategy dispatch** (🔎 `:41-49`), of which 🔎 **`manual` and `manual_single` fetch no page at
  all** (`:1165-1172`) — the only way a truck with no usable website gets a schedule. **D/E have two
  strategies and no manual mode.**

🔴 Both manuals state the failure mode explicitly: **a merge that drops these breaks those sites while the
run stays green and the events simply stop.**

---

## 3. C — THE THREE REPEATED CLAIMS, CORRECTED WITH THE OLD VALUE QUOTED

| # | Old claim | What is true |
|---|---|---|
| 1 | *"the SCREENSHOT extractor built today, which **reuses** `app/api/manage/process-schedule/route.ts`"* | 🔴 **It reuses neither that route nor anything it imports.** 🔎 `app/api/admin/screenshot-events/route.ts:19-25` imports four things — `next/server`, `@supabase/supabase-js`, `@/lib/auth/admin`, `@/lib/admin/screenshot-events`. 🔎 `lib/admin/screenshot-events.ts:17` imports **only** `@/lib/venue-signature`. **A FOURTH independent implementation.** Reasoned at 🔎 `lib/admin/screenshot-events.ts:8` — but ⚠️ **today's work added a divergence rather than removing one**, and must not be described as a reuse. App §51.7, §3 DRY note |
| 2 | *"the app's extractor asks for postcodes — 1,100 of 2,952"*, cited as evidence the app's prompt is better | 🔴 **The 1,100 came from the SCRAPER's `Notes` catch-all rule** (🔎 `:1230` rule 7), not a postcode field — 🧪 `discovery_events` **has no `postcode` column at all**. **The app's extractor contributed to neither the 1,100 nor the 0-of-517**: it never writes to `discovery_events`. Its output goes to `truck_events`, where 🧪 21 of 57 `manual` rows carry a real postcode. ⚠️ **The app's prompt does have the only real postcode field and an ENRICH step — but the 1,100 was never evidence of that.** App §51.3 |
| 3 | *"six vendor-email events in four months"* | 🔴 **v6.57 has inserted ZERO.** 🧪 All six `Email Scheduler` rows carry the **May migration's** `created_at` (`2026-05-22T14:58:43.562393+00:00`, inside a 661-row single-second batch) and a **pre-v6.57 `ai_notes` format** (bare `[✉️ Email]`; 🔎 `:426` writes the action suffix unconditionally, and 🧪 **0 of 4,300 rows** carry one). A silent 401 is ruled out because the screenshot path put **344 post-migration rows through the same mirror**. Pipeline §19.0 already said this correctly; **V1.7 restates it because it has been mis-cited**, and names *"six in four months"* as the overstatement |

---

## 4. D — THE FILTERS AS A DEVIATION SURFACE

Pipeline **§20.6**, app **§51.5**, both backlogs.

**Three exclusion matchers, differing on all three axes** — the scraper's (strips spaces, Levenshtein ≤ 1,
**truck** name, global), the Apps Script's (same normaliser, **containment**, **truck** name, global), and
the app's (🔎 `lib/schedule-extract.ts:13`, `:17` — **keeps spaces**, **substring**, applied to the **VENUE**
name at 🔎 `app/manage/[token]/page.tsx:7525, 7526, 7579`, and scoped **per `truck_id`**).

**Two invalid-venue lists:** 🔎 `lib/schedule-extract.ts:11` — **5** entries by **exact equality** (applied
`:186`); 🔎 `lib/admin/screenshot-events.ts` — **9** entries by equality **or `startsWith`**; the scraper has
**none**.

🔴 **Recorded with the concrete consequence rather than as a tidiness note:** *"Closed for refurbishment"* is
dropped by the 9-entry list and **kept** by the 5-entry one, because the latter matches only on equality.
**Same input, two live answers.**

⚠️ **A note on the count.** My own build report described the screenshot path as adding a **fourth**
matcher. **It does not add a fourth *rule*** — it reuses the scraper's normaliser and 1-edit matcher via
`lib/venue-signature`, applied to the truck name. **It is a fourth *call site* of three rules.** Both
manuals now say **three matchers**, with the screenshot path noted as reusing the scraper's.

---

## 5. E — THE SCREENSHOT UPLOAD (app manual §51.6, pipeline §21)

✅ A **tab on `/admin`** behind `verifyAdmin`; drop/paste/pick with **no button**; **one request in flight**;
🔴 **nothing stored server-side** — the browser holds the file, so a failed or empty row can be re-dropped.

🔎 **The Drive defect it replaces:** v6.57 `:748` `file.setTrashed(true)` sits **after BOTH branches**, so a
call that succeeded but yielded zero events **binned the only copy**, while a thrown error kept the file.

🔴 **Recorded as a property of the ROUTE, not of the new page:** 🔎 `/api/inbound-schedule:212` inserts into
`truck_events` with `status:'unconfirmed'` and 🔎 `:250-270` **emails the operator** a link carrying
`/manage/${dashboard_token}?tab=schedule`, gated (🔎 `:137-153`) on a linked truck whose
`scraper_preference` is not `'manual'`. **The Apps Script and the scraper's HatchGrab loop inherit this
identically** — any path POSTing there does.

✅ 🧪 **The matcher is a strict subset**: 0 refused only by the new path, **8** only by the Apps Script, and
those 8 were **false positives** — `"dis"` normalises to `"di"`, blocking any name containing "di".

⚠️ 🧪 **Four live trucks get no events from this path** (Just Baked by Sophie, The Linton Kitchen,
Dessert MK, Axle & Hop) — faithful to the old path, **a real gap in both, a data problem**.

🔴 ⚠️ **UNVERIFIED and recorded as OPEN**: 🧪 zero rows produced, and no admin session is obtainable, so the
UI and `verifyAdmin` have **never been exercised**.

---

## 6. F — THE THREE STANDING LESSONS

Added to **§35 Cross-cutting engineering invariants** (app, in that section's evidence-first house style)
and to **"THE STANDING LESSONS FROM THIS PASS"** in the V1.7 changelog entry (pipeline, matching its style).

1. 🔴 **A measured difference between two prompts beats any reasoning about the code around them.** 37% vs
   0% with model, file, fetch and database held constant settles in one table what reading the surrounding
   code could not.
2. 🔴 **Fixing one writer of a bad-data class is not fixing the class.** Both prior statements about the
   gauntlet were about *individual writers*; nobody enumerated them. **Grep for writers of the TABLE, not
   for callers of the fix** — the fix names itself, the defect does not.
3. ⚠️ **A paged read that stops early looks exactly like a small dataset.** Three pagination failures in one
   pass each printed a confident, plausible, wrong and **small** total, and **none threw**: a 1,000-row
   default truncating a 4,300-row table (reporting a source as absent that had six rows), an ignored `Range`
   header producing an infinite loop, and an error object concatenated into a result array yielding eleven
   "rows" from a query that failed with `42703`. **Assert the fetched length against a `count=exact` header,
   in the same script, printing the assertion.**

---

## 7. UNRESOLVED ITEMS CARRIED FORWARD — none resolved by omission

**Pipeline manual UNREAD list (6 new):** the live app geocoder; whether C's 0% is prompt or input; the three
matchers and two lists; the admin path's zero rows; the four excluded live trucks; whether the two Puppeteer
implementations behave identically (⚠️ compared **by reading, not by running both against one URL**, with
the `click_next`/`scroll_next` naming split recorded as 🧪 **not a live bug**).

**App manual §27 backlog (7 new):** the geocoder (highest priority); the prompt/input question; the matchers
and lists; **prompts are not owned**; the unexercised admin tab; the four trucks; and ⚠️ **`truck_events`
`source='manual'` cannot be split** between importer-created and hand-created rows.

---

## 8. FOR EVERY CLAIM — the null-result shape, and how it was ruled out

| Claim | What it would look like if it proved nothing | Ruled out by |
|---|---|---|
| no postcodes.io fallback on the operator path | a grep that missed a differently-named helper | 🧪 searched for the **string** `postcodes.io` across every non-doc file (exit 0, 18 hits), then followed the **only** app-side helper to its **only** call site |
| `update_event_coords` does not exist | a failed grep prints the same nothing as a true negative | 🧪 the grep **exited 0 with one hit** — in the manual itself. A failed grep exits 2. Then enumerated every `action === '…event…'` independently |
| the operator is not warned | a toast could live elsewhere in the handler | 🧪 grepped for the warn strings and read both handlers around them — `console.warn`, then straight into `api('upsert_event', …)` |
| the screenshot route is independent | it could import transitively | 🔎 read **both** files' complete import lists — 4 imports and 1 respectively |
| 37% vs 0% is the prompt | it could be the input | 🔴 **NOT ruled out. Recorded as OPEN in both manuals** rather than presented as settled |
| edits landed where intended | a `str.replace` that matches nothing fails silently | every replacement asserted an **exact expected match count** before applying and printed a mismatch report; **all 10 applied, 0 mismatches** |

---

## 9. WHAT I DID NOT DO

- **No code, script, migration or config was changed** — only the two manuals and this report.
- **No database call was made in this pass.** Every 🧪 figure is carried from
  `extraction-paths-comparison-report.md` and `screenshot-upload-build-report.md`, each cited in place.
- **Nothing was proposed or implemented** for the geocoder, the merge, or the filters. All three are
  recorded as OPEN with the evidence and no recommendation.
- ⚠️ **The source-report figures were not re-derived.** They are cited as 🧪 from those reports; a fresh
  measurement would be a different pass, and re-quoting them here does not make them more established than
  when they were taken.
