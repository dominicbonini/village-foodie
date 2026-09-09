# The vendor email path, written down as rules — report

**9 September 2026 · DOCUMENTATION.** The only file changed is `docs/scraper-reference-manual.md`
(**V1.5 → V1.6**, new **§19**, §16 pointers corrected, changelog dated 9 September 2026) — plus this
report. **No database row inserted, updated or deleted** (every call was a `select`). **The Sheet was not
touched. The Apps Script was not opened, edited or run.** Nothing staged, committed or pushed; `git add`
was not run in any form.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (output quoted) · ⚠️ qualified · 🔴 danger.
**Extensions searched:** none scoped. The script was read by path (`docs/apps-script/village-foodie-v6.57.js`);
`scripts/run-scraper.js` is `.js` and was in scope wherever it was consulted.

**No span of the prompt arrived garbled. No instruction contradicted another.** One figure in the brief's
ESTABLISHED block is corrected below — that is a fact correction, not an instruction conflict.

---

## 0. STATE

`git status --short` — **START and END are identical**: 6 `M`, 15 `??`. `docs/scraper-reference-manual.md`
was already `M` before this task and remains so; the only new path is this report.

```
 M DEBUG_SCRAPED_TEXT.txt          M app/admin/page.tsx        M app/providers.tsx
 M docs/reference-manual.md        M docs/scraper-reference-manual.md   M scripts/run-scraper.js
?? app/api/admin/screenshot-events/   ?? components/admin/ScreenshotsPanel.tsx   ?? lib/admin/
?? docs/…-report.md ×10             ?? docs/sql/precondition-{1,2}-…/
```

🧪 `git diff --stat` confirms **one file changed by this task**: the manual, +595/−29. The other five were
already modified when the task began and are byte-untouched by it.

**Row counts (read-only, unchanged throughout):** `discovery_events` **4,300** · `discovery_trucks` **231** ·
`venues` **814** · `discovery_exclusion_terms` **143**.

---

## 1. FIRST, THE SOURCE WAS CHECKED AGAINST ITSELF

The manual is the source of truth, and its own header says a line citation is a claim until re-checked.

- 🧪 `docs/apps-script/village-foodie-v6.57.js` is **1,451 lines** = a 26-line reference header + a
  **byte-identical** copy of the 1,425-line export (`diff -q` against `~/Downloads/…` → identical).
- 🧪 The drift hash recomputes **exactly**: `7fd1ad21b99881c5bd939135c9af7cbbb3ea637ee3cae44dad14ed67ad6827a1`.
- 🧪 The version string is still `v6.57`.
- ⚠️ **A false positive caught on the way:** `grep -n "END OF REFERENCE HEADER"` returns **two** lines — the
  sentence that mentions the marker (`:16`) and the marker itself (`:25`). Taking the first gave a
  nonsense offset and a shell arithmetic error. **Recorded because it is the mirror of the false-negative
  class the manual warns about: a grep can match too much as easily as too little.**

All citations below and in §19 are **ORIGINAL** line numbers (repo copy = original + 26).

---

## 2. 🔴 THE BRIEF'S ESTABLISHED FIGURE IS HALF WRONG — AND THE CORRECTION STRENGTHENS THE CASE

**The brief states:** *"🧪 `discovery_events` holds SIX events from the vendor email path, all May 2026, one
truck, none since. The path has run on a timer for four months processing nothing."*

**What is true:** 🧪 six rows, `source = 'Email Scheduler'`, one truck (**`Spud & Slice`**), event dates
**22–30 May 2026**, none since. ✅ **The count, the truck and the silence are all confirmed.**

🔴 **What is false: the six were not written by this path.**

| evidence | result |
|---|---|
| 🧪 `created_at` of all six | **`2026-05-22T14:58:43.562393+00:00`** — identical to the microsecond |
| 🧪 rows sharing that single second | **661**, across 30+ sources — the one-off `migrate-from-sheets.cjs` Sheet→DB import |
| 🧪 `Email Scheduler` rows outside that batch | **0** |
| 🧪 `ai_notes` on all six | bare **`[✉️ Email]`** |
| 🔎 what `:426` writes | `"[✉️ Email] \| [" + fu.action + "]"` — the action suffix is **unconditional** |
| 🧪 rows anywhere in the 4,300-row table carrying `\| [ADD]`, `\| [AMEND]` or `\| [CANCEL]` | **0** |

**So the six are Sheet rows the May migration copied in, written by an *older* version of the function.**
🔴 **v6.57's vendor-email write has never produced an observable row in the database.** Not "six, then
nothing" — **zero, ever.**

### 2.1 The silent-401 explanation is ruled out by a control, not by a log

This mattered, because §16.9's known defect is that `mirrorEventsToSupabase` never checks its response — 🔎
`:47-52` `muteHttpExceptions: true`, no `getResponseCode()`, then 🔎 `:54` logs *"Mirrored N event(s)"*
regardless. **A log line proves a POST was attempted, not that anything was written**, so the Logs tab
cannot settle this.

🧪 **The control that can:** the *screenshot* path calls the **same** `mirrorEventsToSupabase`, through the
**same** route, with the **same** `INBOUND_SCHEDULE_SECRET`. It produced **511** rows — **167** inside the
migration batch and **344 after it**, latest **8 September 2026**, across **24 distinct days**. **The mirror,
the route and the secret all work.** A blanket 401 would have silenced both paths; it silenced neither.

### 2.2 ⚠️ Three holes in "it processed nothing", stated rather than glossed

*What the evidence would look like if it were proving nothing, and how far that is ruled out:*

1. 🔴 **A CANCEL writes nothing by design** (🔎 `:409-414` builds only a reply row; `:426` is in the `else`).
   **A vendor who only ever emailed cancellations produces exactly this evidence while the path works
   perfectly.** Not ruled out.
2. 🔴 **An AMEND can be invisible.** The route upserts on `(event_date, truck_name, venue_name)` with
   `DO UPDATE`, so an AMEND keeping those three **overwrites** rather than inserts. I tried to detect that
   by `updated_at`: 🧪 **0 of 4,300 rows** have `updated_at` more than a minute after `created_at` — which
   means **`updated_at` is not maintained on UPDATE at all.** ⚠️ **The check is uninformative, not
   exculpatory, and I am recording it as a hole rather than as a clearance.** Not ruled out.
3. ⚠️ **The Gmail label counts were not read.** *Processed Schedules* / *No Events Found* would bound the
   traffic independently. 🔴 Retention is 30 days, so **the counts are the last evidence that exists and
   they die with the account** — worth reading before the trigger is disabled.

**Defensible statement, now in §19.0:** 🔴 **this path has inserted no event into the database in the ~3.5
months it has been running, and the six rows attributed to it came from the Sheet via the May migration.**
⚠️ **The correction makes the case for switching it off stronger, not weaker** — the demand evidence is
weaker than the brief assumed, not stronger.

---

## 3. 🔴 NINETEEN OF §16'S LINE POINTERS DO NOT LAND

The brief says a claim from a manual is a claim. 🧪 I re-verified every `processVendorEmails` pointer in §16
against the original export. **Every described behaviour is correct. The line numbers are not**, and the
drift is **not a constant offset** (it ranges −18 to +9), so it cannot be corrected by a shift.

| what | §16 said | 🧪 actually | what is really at the cited line |
|---|---|---|---|
| Exclusions `appendRow` | `:232` / `:234` | **`:243`** | `:234` = the `exclusionsToAdd` assignment |
| the retro-delete `deleteRow` | `:245` | **`:253`** | `:245` = its `logToSheet("Auto-Excluded…")` |
| AMEND/CANCEL replace `deleteRow` | `:424` | **`:429`** | `:424` = a `tableRows +=` line |
| Events `setValues` | `:426` | **`:431`** | `:426` = `rowsToAppend.push` |
| `mirrorEventsToSupabase(rowsToAppend)` | `:427` | **`:432`** | `:427` = `}` |
| Trucks `appendRow` | `:349` | **`:340`** | `:349` = `eVi = toTitleCase(…)` |
| Venues `appendRow` | `:380` | **`:362`** | `:380` = the dedup `for` loop |
| contact capture | `:401-405` | **`:369-373`** | `:401` = `}` |
| Brevo reply | `:456` | **`:463`** | `:456` = `profileLink +` |
| label ops | `:171,:177,:270,:272,:458,:465,:472` | **`:168,:176,:268,:270,:464,:470,:473,:477`** | `:171` = `getSubject()` |
| admin forwards | `:175,:463,:470` | **`:175,:469,:476`** | `:175` ✅ correct |

🧪 **The drift is not confined to the email path:** `file.setTrashed(true)` is **`:748`**, not `:752`; the
screenshot Trucks/Venues appends are **`:679`/`:732`**, not `:668`/`:711`. ⚠️ **My own screenshot build
report cited `:748` and was right; the manual was wrong.**

✅ **All corrected in place** in §16.1, §16.2, §16.5, §16.6, §16.7, §16.8 — 18 replacements, each applied
only on an exact unique match, with a mismatch report (one no-op presence check did not match and changed
nothing). ⚠️ **Only these two functions were re-verified. The pointers for the other 28 are still
unchecked**, and that is now an UNREAD bullet.

---

## 4. WHAT §19 CONTAINS

New **§19 · THE VENDOR EMAIL PATH — THE RULES, NOT THE CODE** (~340 lines), written as rules with the
executing line beside each, because a rebuild will not be Apps Script.

| § | Covers |
|---|---|
| **19.0** | 🔴 The usage figure first, with §2 above and its three holes |
| **19.1** | **Intake** — the four-label lifecycle as a state machine, the queue as `pending + retry`, labels removed *before* work (and the drop-on-crash window that creates), last-message-decides, the >1 h escalation to admin that never retries again, the **200 s** outer and **180 s** inner budgets, and failure routing by *message text* |
| **19.2** | **Extraction** — the prompt **quoted verbatim** with interpolations marked; ADD/AMEND/CANCEL as a **diff not a schedule**; the date rules incl. the December→January year roll; 🔴 the **context injection**; the 3-message / 5,000-char window; the **one-image, <3.5 MB, dedup-by-byte-size** cap; the 8×429 retry; the **text-only bandwidth fallback**; empty-string-never-`00:00`; and 🔴 **no postcode is asked for** |
| **19.3** | **Identity** — sender address as key, Trucks col K / Venues col F matched by `includes` (⚠️ substring-on-email collides), the **one-matched-truck shortcut**, the narrower venue equivalent, and `isVenueSender` with all three things it flips |
| **19.4** | **Write** — the **four-pillar** duplicate check (date exact, truck/venue/village by containment, ⚠️ which folds `The Bell` into `The Bell Inn`), **both** TBC carry-forwards, the two delete sites, the 9-column append, and the **Brevo diff reply** (strike-through cancels, bolding against the *old* value, column swap, `*` for new trucks, four-way deep link) |
| **19.5** | 🔴 **Five anti-requirements** — see below |
| **19.6** | **Six keeps** — context injection, diff reply, escalation, bandwidth fallback, empty-not-`00:00`, and 🔴 **add the postcode** |
| **19.7** | **The two-domain question, recorded as open** — nothing proposed |
| **19.8** | **The trigger is being disabled, and what dies with it** |

### 4.1 The anti-requirements, with the reason each must not return

- **A1 — the retro-delete.** 🔎 `:234` takes the term from the **model's reply**, `:243` appends it with no
  check against the Trucks tab, `:253` **deletes every Events row whose truck contains or is contained by
  it** — unattended, unlogged, using the **looser** of the two matchers.
- **A2 — a CANCEL that never reaches the database.** 🔎 `:429` deletes the Sheet row, nothing is appended,
  the mirror is never called. **The vendor is emailed a confirmation and the event stays live on the map.**
  The confirmation makes it worse.
- **A3 — the unvalidated geocoder.** 🔎 `:354-360`, first Google result written, no postcode lookup, no
  distance check, no `partial_match` or result-type check. 🧪 158 `venues` rows carry coordinates and no
  postcode.
- **A4 — a mirror that does not check its response.** 🔎 `:47-54`. **This is why §2.1 needed a control.**
- **A5 — the unguarded `exclusionsToAdd` append.** 🔎 `:240-243`; three checks, none against the Trucks tab,
  though that data is loaded and in scope at 🔎 `:157`. ⚠️ Distinct from A1: A1 is the deletion, A5 the write.

### 4.2 🔴 The retro-delete's provenance — BOTH readings recorded, as instructed

The three truck-name terms (`Steak & Honour`, `The Noodle & Dumpling Bar`, `Kerief`) are recorded with
**both** readings and **no adjudication**:

- **Reading 1 — a person added them deliberately.** A truck may have **asked to be delisted**. Under this
  reading the terms are a legitimate record and removing the mechanism loses a real capability.
- **Reading 2 — the model proposed them and an unguarded writer appended them.** Much of the tab is
  unmistakably machine-generated (Facebook page-metadata labels, a sentence truncated mid-word).

🔴 **They cannot be told apart:** no timestamp, no author column, no adjacent data, and the Drive revision
history is unavailable (Drive API disabled on GCP project `227274860029`). **I did not guess.**

⚠️ **And one earlier report is superseded.** `exclusions-provenance-report.md` §7 point 3 concluded *"No
other automated writer to the tab is evidenced."* It was written 8 September, **before** the Apps Script was
read. 🔎 **There are two — `run-scraper.js:784` and `processVendorEmails:243` — and only the second also
deletes.** The report's central finding (individual rows are unattributable) is unaffected.

### 4.3 The postcode, measured rather than asserted

🔎 The JSON contract at `:502` asks for Date, Times, Truck, Venue and **Village, and stops.** 🧪 Measured
over `ai_notes` — because there is **no `postcode` column on `discovery_events`** at all (the app's
extractor writes it into `ai_notes`; §14):

| source | rows with a postcode |
|---|---|
| `Email Scheduler` | **0 / 6** |
| `Drive Screenshot` | **0 / 511** |
| `URL:` (the scraper) | **1,100 / 2,952** |

⚠️ **The brief attributed the 511 Drive rows to "this path"; they are the *screenshot* path.** The point
survives intact and is actually broader: **both** Apps Script Gemini paths ask for no postcode and produced
**zero** between them. **Asking for it costs one line of prompt** and is what lets `findVenue` anchor a row.

### 4.4 The two-domain asymmetry, recorded and left open

- **HatchGrab operators have a login** — a dashboard, and the route already bridges matching events into
  their `truck_events` as `unconfirmed` **and emails them**. Email is a second, weaker path to something
  they can already do better.
- **Village Foodie trucks have no login at all** — no dashboard, no token, no account. 🔎 `mirrorEventsToSupabase:32`
  posts to **`https://www.villagefoodie.co.uk/api/inbound-schedule`**; email is their only channel.
- ⚠️ Rebuilding on both gives operators a redundant channel that can silently contradict their dashboard —
  **A2 makes that concrete.** Rebuilding on neither leaves Village Foodie trucks unable to correct anything.
- 🔴 **Nothing proposed. Dominic's decision.** Recorded only so the constraint is not rediscovered: a form,
  a tokenised link, or extending the operator dashboard may each beat email — it was chosen when there was
  no app to point anyone at.

### 4.5 What dies when the trigger is turned off

Truck and venue auto-creation from email (🔎 `:340`, `:362` — Sheet-only anyway); 🔴 **sender-email capture
into Trucks col K / Venues col F (🔎 `:369-373`) — the only automated writer of those columns, and the one
loss with no upside**, since identity depends entirely on that column, so the path gets *harder* to rebuild
the longer it is off; and the Brevo diff reply (🔎 `:463`), so **vendor threads will accumulate unanswered**
under *Process Schedule* in an inbox that says of itself that it is not monitored (🔎 `:461`).

**Pure benefit:** the retro-delete and the unguarded append stop. 🧪 **The database is unaffected either
way** — §2 shows this path has inserted nothing since May, and §16.5 shows its deletes never left the Sheet.

---

## 5. FOR EVERY CLAIM — the null-result shape, and how it was ruled out

| Claim | What it would look like if it proved nothing | Ruled out by |
|---|---|---|
| six `Email Scheduler` rows, one truck | a truncated page read as the whole table | 🔴 **This bit me.** My first tally hit PostGREST's **1,000-row default** and reported `Drive Screenshot = 50` and **no `Email Scheduler` at all**. Re-run with `limit`/`offset` paging to **4,300/4,300**. A second attempt using a `Range` header **looped forever** because the header was ignored, and a third **concatenated an error object** (`42703`, no `postcode` column) into the array. **All three failures printed plausible numbers.** |
| the six came from the migration | one shared timestamp could be coincidence | 🧪 identical **to the microsecond**, and **661** rows share that exact second across 30+ unrelated sources — a bulk insert, not a coincidence |
| v6.57 never wrote them | the format argument could be my misreading | 🔎 `:426` concatenates the action **unconditionally** — there is no branch producing a bare `[✉️ Email]`; 🧪 **0** rows in 4,300 carry any action suffix, while the screenshot path's format (🔎 `:738`) matches its rows **exactly** (486 bare `[📱 Drive]`, 21 `\| [⚠️ NEW TRUCK]`) |
| the mirror/secret work | absence of email rows could be a 401 | 🧪 the **same** function/route/secret produced **344** post-migration rows for screenshots, across 24 days, latest 8 Sep |
| "processed nothing" | CANCEL/AMEND could be invisible | 🔴 **Not ruled out — recorded as two open holes**, with the `updated_at` check explicitly labelled **uninformative** rather than clearing it |
| §16's pointers are wrong | my own line numbering could be off by the 26-line header | 🧪 read from a **header-stripped** copy that `diff -q` proves byte-identical to the export, and each cited line **printed** to show what is actually there |
| the term-provenance is unresolvable | I could have inferred from plausibility | 🔴 stated as **two readings with no adjudication**; the one read that would settle it (`drive.revisions.list`) is **unavailable** |
| 0 postcodes on those rows | a regex that matches nothing looks the same as zero | 🧪 the **same regex, same run** returned **1,100** hits on scraper rows and **4/4** on the Pimp My Fish manual rows |
| the TIME CLASH flags reached the DB | would contradict §16.8 | 🧪 all 45 carry the **migration** timestamp — they came in with the May import, not via the mirror. **§16.8's reasoning holds**; the mechanism is now named |

---

## 6. WHAT I DID NOT DO

- **Nothing was concluded from a comment, a type or a variable name.** Every rule in §19 cites the executing
  line, and every disputed pointer was confirmed by printing the line.
- **The Sheet was not read or modified**, so the Exclusions tab's current contents are as last recorded
  (143 rows); the Apps Script was not opened.
- **No trigger was touched.** §19.8 records the intent; disabling it is Dominic's action.
- **No code was changed.** The rebuild is not started, and §19.7 proposes no design.
- ⚠️ **§19 is written from the source, not from behaviour** — there are no surviving examples to check it
  against, which is the whole reason the section exists.
