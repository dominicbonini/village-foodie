# The Apps Script, documented — v6.57

**Date:** 9 September 2026 · **Mode:** documentation. No code changed (the only `.js` written is a **reference copy** under `docs/`, not executed). No database row touched — every database call was a `select`/count with the service key. No Sheet cell touched — every Sheet call used the `spreadsheets.readonly` scope. The Apps Script itself was not opened, edited or run. Nothing staged.

**Evidence tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (output quoted) · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. The script was read by path; the repo sweeps were `grep -rn -I … .` over every file with only `node_modules/.next/.git` excluded.

🔴 **Line numbers cited here are the ORIGINAL export's** (1,425 lines). The repo copy carries a 26-line header, so **repo line = original line + 26**.

---

## 0. `git status --short` — START and END, and the source's provenance

**START** (5 `M`, 4 `??`, `HEAD 6fe8634`):
```
 M app/admin/outreach/page.tsx
 M app/admin/page.tsx
 M docs/reference-manual.md
 M docs/scraper-reference-manual.md
 M scripts/run-scraper.js
?? components/admin/
?? docs/manual-update-2-report.md
?? docs/passb-sheet-decoupling-report.md
?? docs/sheet-retirement-plan-report.md
```
**END:** identical plus `?? docs/apps-script/` and `?? docs/apps-script-documentation-report.md`; `docs/scraper-reference-manual.md` is further modified (V1.3 → V1.4). `HEAD` unchanged, nothing staged.

⚠️ **The prompt said the source was at `docs/apps-script/village-foodie-v6.57.js`; it was not — that directory did not exist.** Your trailing note ("apps script is in downloads") resolved it: 🧪 `~/Downloads/village-foodie-apps-script-v6.57.js`, 72,116 bytes, saved 20:44 on 8 September, header line 2 `VILLAGE FOODIE: ULTIMATE MASTER PRODUCTION BUILD (v6.57)`. I copied it to the stated repo path (`cp`, then `cmp` → byte-identical), which is what the prompt described as already done. **The STOP condition was about documenting from a summary; the source was on disk, so I proceeded, and I am flagging the path discrepancy rather than hiding it.**

**Task One — the header.** 🧪 The body's SHA-256 was taken **before** the header was added (`7fd1ad21b99881c5bd939135c9af7cbbb3ea637ee3cae44dad14ed67ad6827a1`) and recorded inside the header; after adding it, `tail -n +27 | shasum` reproduces the same hash, so **the body is byte-identical to the export and the drift check works as written.** ⚠️ The first header write failed on an f-string placeholder *before* opening the file for writing — `cmp` against the Downloads original confirmed it had touched nothing — and was re-run. The header states: reference copy · not executed from this repo · live version at Sheet → Extensions → Apps Script · copied 9 September 2026 · **a silently drifting copy is worse than none** · the +26 line offset.

---

## 1. WHAT IS TRUE ABOUT THE SCRIPT — and where the prompt's nine claims stand

Full detail is in the manual's new **§16**; this is the verdict on each numbered claim, with the executing line.

| # | Claim | Verdict | Executing evidence |
|---|---|---|---|
| 1 | every function documented, menu vs timer separated | ✅ done, §16.1 (30 functions). Triggers recorded from your editor read: **4 time triggers, frequency UNKNOWN**, not inferred | 🔎 `onOpen:89-105` lists 8 menu items; the trigger list is 🧪 yours, 9 Sep |
| 2 | the retro-delete | ✅ **correct** | 🔎 `:234` `exclSheet.appendRow([ex])` → `:240-241` containment match on Events col D → `:245` `eventsSheet.deleteRow(r)` |
| 3 | two `isFuzzyMatch`, different semantics; normalisers to be compared | ✅ **correct on the matcher**; normalisers **IDENTICAL** | 🔎 `:1243` `includes` vs `run-scraper.js:66-92` Levenshtein; 🧪 normalisers identical on **3,536/3,536** real strings; only `String()` coercion differs |
| 4 | POSTs to `/api/inbound-schedule`; anon key read-only; corrects the audit | ✅ **correct** — the audit and the plan were wrong, corrected in place | 🔎 `:32-52` fetch with `INBOUND_SCHEDULE_SECRET`; 🔎 anon key used at `:850-851` in a GET; no `SERVICE_ROLE`, `insert`, `upsert` anywhere. 🧪 426/511 Drive rows have `venue_id` (the route's enrichment) vs 1,133/2,952 scraper rows |
| 5 | deletes never mirror; explains 3,577; hard constraint | ✅ **correct, and there are FOUR delete sites, not three** — the AMEND/CANCEL replace at `:424` was not in your list, and it is the worst one | 🔎 `:1323`, `:1314`, `:245`, `:424` — no outbound call after any of them; 🔎 CANCEL builds a strike-through row only (`:409-415`), never calls the mirror |
| 6 | Sheet-only creation; the 348; `Yes - New Truck` | ⚠️ **partly wrong.** Creation is Sheet-only (✅). **It does NOT account for the 348: 203 carry the scraper's marker; at most 145 are the script's.** `'Yes - New Truck'` is the script's in the Sheet, **but has three writers in total and cannot be attributed in the DB** | 🔎 `:349`, `:668`, `:380`, `:711`; 🧪 348 = 203 marked + 145 unmarked (122 coords-no-postcode); 🔎 `:344`/`:666` vs `run-scraper.js:1689` vs `migrate-from-sheets.cjs:72` |
| 7 | four Google-geocoding functions, no gauntlet; corrects V1.1 | ✅ **correct** | 🔎 `:368-374`, `:694-700`, `:1406-1410`, `:780-793`; `if (status === "OK" && results.length > 0)` and the first hit is written. 🧪 158 `venues` rows have coordinates and no postcode |
| 8 | Gmail, Brevo, Drive + `setTrashed`, Logs cap, blast filter, time-clash col 9 | ✅ all verified, §16.8; plus contact-capture into Trucks col K / Venues col F (`:401-405`) which was not in the list | 🔎 `:145-148`, `:1107-1140`, `:752`, `:83-85`, `:869-871`, `:1303` |
| 9 | per-function migration verdicts; what breaks | ✅ §16.9 | — |

**Three things the prompt did not ask for and the source insisted on:**

- 🔴 **`mirrorEventsToSupabase` never checks the response.** 🔎 `:47-52` `muteHttpExceptions: true`, no `getResponseCode()`, then `:54` `logToSheet("Mirrored " + rows.length + " event(s) to Supabase.")` unconditionally. **A rotated `INBOUND_SCHEDULE_SECRET` produces a 401 and a "Mirrored 6 event(s)" log line.** The Logs tab lines the deletion-rules report cited as proof of DB writes prove POSTs.
- 🔴 **A vendor's emailed CANCEL never reaches the database.** The Sheet row is deleted (`:424`), nothing is appended, the mirror is not called. **The event stays live on the public map.** An AMEND that changes the venue adds a second DB row and leaves the old one (the route upserts on `(date, truck, venue)`).
- 🔴 **`file.setTrashed(true)` at `:752` runs when a screenshot yields zero events**, not only on success. A misread image is gone after one pass; only a thrown error keeps it.

---

## 2. THE CORRECTIONS MADE, WITH THE OLD VALUES

| Where | Old value (quoted) | New value | Evidence |
|---|---|---|---|
| `sheet-migration-audit-report.md` §5, §9 `:461` row, §10 | *"**An external writer holds a Supabase write key.**"* / *"it holds a write key"* / *"a direct DB writer exists; its identity and key are inferred (⚠), not read"* | **No write key. It POSTs to `/api/inbound-schedule` with the shared secret; the only Supabase key is anon, used for one GET.** The audit's own §10 hedge was right. *(Recorded in the manual §16.4; the audit file itself is left as the historical record it is.)* | 🔎 `:32-52`, `:850-851`; grep `SERVICE_ROLE` → none |
| `sheet-retirement-plan-report.md` §5 | *"it holds a Supabase write key"* | same correction; and **step 6's "make it DB-only" is already true of events** — what remains is trucks, venues, exclusions and the four deletes | 🔎 as above |
| manual `:101` (V1.2 changelog) | *"writes `discovery_events` directly … creates `venues`"* | struck; *"POSTs to `/api/inbound-schedule`"*; venues created **in the Sheet only** | 🔎 `:380`, `:711` — `appendRow`, no outbound call |
| manual `:143` (V1.1 changelog) | *"Every coordinate now comes from **postcodes.io** or the venue is stored with none."* | struck; **true of the scraper only** — four Google-geocoding sites in the script | 🔎 §16.7 lines; 🧪 158 rows |
| manual `:692` (§8.4) | *"Its predicate and schedule are UNREAD."* | predicate = `removePastEvents` (`< today`, Sheet tz), on a time trigger; **frequency UNKNOWN** | 🔎 `:1321-1323`; 🧪 trigger list |
| manual `:709` (§8.7) and the UNREAD bullet `:922` | *"The Apps Script's code, triggers and Events-tab predicate"* unread | **RESOLVED** with the two embedded claims corrected in the same line | — |
| the prompt, item 6 | *"establish whether this accounts for the 348 Sheet-only venues"* | **it does not, by a majority**: 203/348 are the scraper's | 🧪 §16.6 |
| the prompt, item 5 | *"`removeDuplicateEvents`, `removePastEvents` and the retro-delete"* | **plus the AMEND/CANCEL replace at `:424`** — four sites | 🔎 |
| `deletion-rules-report.md` `:173` | *"the Apps Script **writes `discovery_events` directly**, confirming the migration audit's finding independently"* | it confirmed a POST; the "directly" was carried over from the audit. Left as written (historical), corrected in the manual | 🔎 `:54` |

**Manual versioned V1.3 → V1.4**, header and front-matter both bumped (🧪 `head -3`), changelog entry dated 9 September 2026 in the house style, new §16 (16.1–16.9) inserted before the UNREAD section.

---

## 3. FOR EVERY CLAIM — what a null result would look like, and how it was ruled out

| Claim | Null-result shape | Ruled out by |
|---|---|---|
| "No direct DB write anywhere in the script" | a grep that did not run prints nothing | 🧪 the same grep family printed the two `SUPABASE_ANON_KEY` lines and the six `getSheetByName` counts in the same session; `getSheetByName` census exit 0 with 7 distinct tabs; the `Vendor Ingest` grep exit **1** with nothing printed is the true negative (a failed grep exits 2) |
| normalisers identical | comparing two functions I paraphrased | both were **copied verbatim** from `:1235-1238` and `run-scraper.js:55-64` into one script and run over 3,536 live strings; a paraphrase error would have shown as a difference |
| matchers diverge | asserting from the source text | 🧪 executed on concrete pairs both ways, and on the live 143 × 152 term/truck product: 5 vs 7 |
| Drive rows went through the route | `venue_id` could have been set by the hand backfill | the backfill linked by name and touched `URL:` rows too — those sit at 38% while Drive rows sit at 83%; the route's `findVenue` at insert is the only mechanism that separates the two populations |
| 203 of 348 are the scraper's | the marker could be human-typed | the marker string is written verbatim by `run-scraper.js:1806-1808` and appears on 342 of 936 Sheet rows; no human writes `[⚠️ NEW FROM SCRAPER]` 342 times |
| 145 are the script's | a blank column L is also what a human leaves | **stated as a ceiling, not a count**; 122 of the 145 have the script's exact coordinate-no-postcode shape, and 0 have an owner email |
| the retro-delete would remove 1 row today | the count could be a normalisation artefact | computed with the script's own `normalizeTruckKey` + containment, over the live Events col D |
| four triggers | the code has no schedule | 🧪 not derived from code — transcribed from your editor read; frequencies **left UNKNOWN** exactly as instructed |

---

## 4. OPEN, CARRIED FORWARD

- 🔴 **Trigger ownership: "Other user."** All four stop silently if that account loses access. No monitor exists. **OPEN.**
- 🔴 **Trigger frequencies.** UNKNOWN; the Logs tab suggests ~5 min for the email job and far less often for screenshots, but the tab is a 500-row window and the manual now says why that proves nothing.
- ⚠️ **Whether the live project is still v6.57.** The copy is byte-exact as of 20:44 on 8 September; every citation is a claim the moment the live editor is edited. The header says so.
- ⚠️ **Who added the three removed exclusion terms** — still UNRESOLVED; §16.2 establishes only that this script is the sole automated writer that also deletes.
- ⚠️ **The 12 `discovery_trucks.exclude_reason = 'Yes - New Truck'` rows** — scraper mirror or May migration; not attributable from the row.
- ⚠️ **`runEmailJob`'s anon read of `discovery_events`** depends on that table's public SELECT policy; if RLS is tightened the weekly blast silently sends nothing ("FATAL" goes to the Logs tab only).

**No span of the prompt arrived garbled. One instruction conflicted with the facts on disk (the stated path did not exist) and your own trailing note resolved it; recorded in §0 rather than chosen silently.**
