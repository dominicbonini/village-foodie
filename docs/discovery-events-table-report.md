# `discovery_events` admin table — view and amend

**9 September 2026.** Built. Four files: **new** `app/api/admin/discovery-events/route.ts`, **new**
`components/admin/DiscoveryEventsPanel.tsx`, **new** `components/admin/InlineField.tsx` (a *move*, see §4),
and `app/admin/page.tsx` (tab wiring). **No schema change, no migration, nothing installed.** Nothing staged.

🔴 **NO DELETE WAS BUILT** — no endpoint, no action, no disabled control (§8).
🔴 **`truck_events` IS NEVER READ OR WRITTEN.** 🧪 After stripping comments, the new route's only
`.from()` targets are **`discovery_events`** and **`discovery_trucks`**; the single textual occurrence of
`truck_events` is the comment saying it is out of bounds.

---

## 0. WHAT THE CODE SAYS THAT THE MANUALS DO NOT

✅ **"Nothing in this repository deletes from `discovery_events`" still holds** — and this task does not
change it.

🔴 **BUT THE MANUALS DO NOT RECORD THE THING THAT MATTERS MOST FOR AN AMEND TOOL: an amendment to a row the
scraper still produces does not last.** 🔎 Both writers upsert on the same key with `DO UPDATE`:

| writer | line | conflict target |
|---|---|---|
| the scraper's own mirror | `scripts/run-scraper.js:2312` | `onConflict: 'event_date,truck_name,venue_name'` |
| `/api/inbound-schedule` (Apps Script + the HatchGrab loop) | `route.ts:110` | same key, `ignoreDuplicates: false` |

**Two different bad outcomes, and both are silent:**

- **Editing `truck_name` / `venue_name`** changes the row's *identity*, so the next run's upsert no longer
  matches it and **re-inserts the original alongside your corrected row**. The fix is not overwritten — it
  is **duplicated**.
- **Editing anything else** (times, village, notes) is **overwritten** by the next run's `DO UPDATE`.

⚠️ **Corrections stick only on rows the scraper no longer emits** — past-dated events, and trucks off the
site list. **This is stated on the screen itself**, not only here, in an amber line above the table: a tool
that invites corrections must say when they evaporate.

⚠️ **This is the same finding as yesterday's** *"the stored value is still a typo... it will keep
re-appearing while the source spells it that way"* — now with the mechanism named.

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/discovery-run-log-migration-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
```

🧪 Scoped `git status --short` over `app/manage`, `app/order`, `app/trucks`, `app/o`, `app/api/menu`,
`app/api/discovery`, `app/api/inbound-schedule`, `components/dashboard`, `scripts/`, `public/` and
`package.json` returns **nothing**. **The scraper pipeline was not touched.**

---

## 2. DIAGNOSIS 1 — ROUTE AND GATE

🔴 **`app/api/admin/discovery-events/route.ts` is a NEW ROUTE. I am declaring it as new, not describing it
as a reuse** — app manual §51.7 records a "reuse" that was a fourth independent implementation.

**What is genuinely reused is the GATE PATTERN**, identical to `app/api/admin/route.ts` and the outreach
route: `verifyAdmin(req)` on the handler (404 to a non-admin, not 401 — it does not confirm the route
exists) plus a service-role client built from `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. **No new gate,
no widened access, and the outreach route is untouched by this task.**

⚠️ **Why not extend the outreach route:** it is a different subject with eight tasks of signed-off work in
it. Adding a second tool's actions there would make one file the writer for two tables.

---

## 3. DIAGNOSIS 2 — WHICH NORMALISER, AND WHY

🔴 **CHOSEN: `normalizeVenue` + `venuesFuzzyMatch` from `lib/venue-signature.ts`. No sixth normaliser was
written and none of the five was collapsed.**

**Why that one.** "Orphan" must mean *invisible to **every** name-matching consumer*, so it has to be
measured against the **most permissive** matcher — a stricter rule would flag rows the scraper can
actually see. `lib/venue-signature.ts` is documented as a **byte-for-byte mirror of the scraper's own
`normalizeName` / `isFuzzyMatch`**, which is the loosest rule in the system (one edit of Levenshtein, plus
containment either way), and it already lives in `lib/` where the app can import it — the admin screenshot
path uses it for exactly this "is this truck known?" question.

🧪 **Measured over all 4,340 rows, which is how the choice was made rather than argued:**

| candidate | orphan names / rows |
|---|---|
| outreach `norm` (trim+lower) | 21 / 60 |
| discovery feed `normalize` | 21 / 60 |
| `venue-matcher` `normName` | 21 / 60 |
| `venue-signature` `normalizeVenue`, exact | 21 / 60 |
| 🔴 **`venue-signature` + `venuesFuzzyMatch` (the mirror)** | **20 / 55** |

**The mirror is strictly the most permissive**, and it lands on the same answer the consumers do.

⚠️ **The five stay separate**, as the manual requires: the scraper's forgives a typo in noisy scraped text;
the outreach route's is a plain trim+lowercase over a known row; the feed's strips all non-alphanumerics.
**Collapsing them would silently change which events three surfaces attribute to which truck.**

---

## 4. DIAGNOSIS 3 — ROW VOLUME, AND WHAT IT DECIDES

🧪 Re-derived from `count=exact` headers (not fetched lengths — the fault that mis-reported this table
twice today):

| | |
|---|---|
| `discovery_events` total | **4,340** |
| future-dated (`>= today`) | **740** |
| past-dated | **3,600** (740 + 3,600 = 4,340 ✅) |
| `venue_id IS NULL` | **2,267** — of which **340** future |
| `discovery_truck_id IS NULL` | **1,947** |

⚠️ **The brief's "roughly 2,219" for unlinked venues re-derives as 2,267 today.** Figures move: a scrape
ran at 06:00 and the total rose from 4,339 to 4,340 during this task.

**Decision: the default view loads client-side, like the outreach tab.** 740 future rows is ~3× the
outreach tab's 231 and needs no paging. **All 4,340 is an opt-in toggle**, not the default, because that is
a materially heavier payload for a screen usually opened to look at what is coming.

---

## 5. DIAGNOSIS 4 — WHICH COLUMNS ARE EDITABLE

| column | editable | why |
|---|---|---|
| `truck_name` | ✅ | the field the ORPHAN flag reads; correcting it is the tool's main job |
| `venue_name`, `village` | ✅ | extraction errors a human can fix by reading the source page |
| `start_time`, `end_time` | ✅ | same |
| `event_notes` | ✅ | free text, no consumer keys on it |
| `source` | 🔴 **no** | **provenance.** A row whose provenance can be edited can no longer answer "where did this come from" |
| `created_at` | 🔴 **no** | provenance |
| `discovery_truck_id`, `venue_id` | 🔴 **no** | **foreign keys**, resolved by `findVenue` and the name matcher at write time. Hand-editing an FK to a row you cannot see from here attaches an event to the wrong business with nothing recording it |
| `event_date` | 🔴 **no — deliberately excluded, not omitted** | it is part of the upsert identity (§0), and moving an event in time is closer to "this is a different event" than to "this is a typo" |
| `id` | 🔴 no | — |

**Enforced server-side**, not just by which inputs are rendered: the route filters the body against an
`EDITABLE` allow-list, ignores unknown keys, and writes nothing when a request names only unknown keys.

---

## 6. WHAT WAS BUILT

- **A tab, `📅 Events`**, on `/admin`, mounted only when selected (so it fetches on first selection, never
  holds a stale list) and rendered **outside** the `max-w-6xl` body wrapper — the table's `minWidth` is
  1060px and that wrapper caps at 1152px with no room for padding. `?tab=events` works via the existing
  validator, which reads `ADMIN_TABS` rather than repeating the names.
- **Default view: future-dated, soonest first**, with an "All dates" toggle.
- **Columns:** Truck · Date · Time · Venue · Village · Source · Flags — and the **filter bar mirrors that
  order**, the outreach convention, with the two flag filters mapping to the Flags column and coming last.
- **Filters:** truck search, date from/to, venue search, source, orphan, venue-link. Client-side over the
  loaded rows; **nothing written by filtering**.
- **Counts:** `n of N events` when a filter is active, plus **`orphan` and `with no venue` counts against
  the total**, always visible.

### 6.1 Inline amend — a genuine reuse, and the proof

🔴 **`InlineField` was MOVED, not copied.** It now lives in `components/admin/InlineField.tsx` and **both**
tables import the one component. Writing a second borderless-input-with-a-dirty-guard would have been the
§51.7 mistake again.

🧪 **Proven, not asserted:** the extracted function body is **2,213 bytes**, sha256 `f5bfe9c0…`, and is
present **verbatim** in the new module; the local definition is gone from `OutreachPanel.tsx`, which still
uses it via the import. **`tsc` passes.** ⚠️ This is the only edit to `OutreachPanel.tsx` — its filters,
chips, media cells, upload path, delete guard and `matchesOutreachFilter` are untouched.

**One writer per column:** each table supplies its own `onCommit`; the component never chooses a write
path. This table's single writer is `update_event` on its own route.

---

## 7. 🔴 PROOFS

### 7.1 The orphan flag — fires on the right rows AND not the wrong ones

**Failure mode:** *a flag that never fires looks identical to one that works, because most rows are not
orphans.* So both halves were tested, against live data, using the route's own implementation with the
real `venue-signature` module compiled and imported.

🧪 **Counts asserted against `count=exact` first:** total fetched 4,340 = header 4,340 ✅; future 740 = 740 ✅;
`venue_id IS NULL` 2,267 = 2,267 ✅. **256** known-truck keys built from names + aliases.

**Fires:**

| | |
|---|---|
| orphan rows, all dates | **55 of 4,340** |
| orphan rows, future | **2 of 740** |
| the future orphan names | **`Village Spice`, `Little Luigi`** |

**Does not fire** — the half that matters, naming the rows:

| truck | rows | orphan? |
|---|---|---|
| 🔴 **`Pimp My FIsh`** | **183** | **false** ✅ |
| `Pizzeria Gusto` | 87 | false ✅ |
| `Nomadough` | 106 | false ✅ |
| `Elder Street Food` | 73 | false ✅ |
| `Buffalo Joe's` | 69 | false ✅ |
| `Smother Spudders` | 14 | false ✅ |

🔴 **`Pimp My FIsh` is the whole point.** A raw string-equality flag would report all **183** of its rows as
orphans; the code's own matching sees none of them as orphans, and **so does this flag**. That is the error
the brief warned about, and it is measured as absent rather than assumed.

**Non-vacuity: 55 of 4,340 — neither zero nor everything.**

### 7.2 The filter predicate

**Failure mode:** *a filter over an empty set reports zero and looks like safety.* 740 rows under test,
count-asserted. **All cases pass**, and the set includes deliberate EMPTY and ALL results so a
stuck predicate would show:

| filter | rows | |
|---|---|---|
| none | 740 of 740 | ALL |
| `truck=pimp` | 8 | proper subset |
| `truck=zzzzz` | **0** | EMPTY (as required) |
| `venue=bell` | 11 | proper subset |
| `orphan=yes` / `no` | **2** / **738** | partition **= 740 ✅** |
| `unlinked=yes` | 340 | proper subset |
| `dateTo=1999-01-01` | **0** | EMPTY (as required) |

### 7.3 Styling — can it take effect?

🧪 The unlayered `!important` rule in `globals.css` targets `input[type=…]`, `select` and `textarea`.
`InlineField` renders `type="text"`, so **the rule does apply** — and at ≥640px it resolves to
`font-size: inherit !important`, which inherits **14px from the table's `text-sm`**. 🧪 Confirmed this table
carries `table-fixed text-sm`. **The size is right, but by inheritance, not by the utility class** — the
same finding as the outreach table, and the reason the class is not evidence on its own.

🧪 Headings: **no bare block-level `flex`** inside `<thead>`; the heading content is `inline-flex`, so the
cell's `text-center` can actually centre it.

---

## 8. 🔴 DELETE — WHAT IT WOULD REQUIRE, AND WHY IT IS NOT HERE

**Not built: no endpoint, no action, no disabled control.** What it would need first:

1. 🔴 **An answer to whether a deletion survives the 06:00 scrape.** It would not: the scraper re-upserts
   from the source page, so a deleted row whose source still lists it **returns the next morning**. Delete
   without a suppression record is a button that appears to work and silently undoes itself.
2. **A tombstone table** — the manual already names this (`discovery_event_suppressions`, plan §2.1) and
   records that the Apps Script's four Sheet-side delete sites never mirrored to the database, which is why
   the Sheet is a pruned view and the database the unpruned ledger. **Delete here without a tombstone
   recreates that divergence in the other direction.**
3. **A decision on the public map**, since `discovery_events` feeds it.

**Stopping there, as instructed.**

---

## 9. EVIDENCE CLASS

- ✅ **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors** across all four files. ⚠️ **No `next build`** —
  your dev server is live and I have already written production output into its `.next` this session.
- ✅ **Executed against live data:** every count in §4 and §7 (count-asserted), the normaliser comparison in
  §3, the orphan flag in both directions using the compiled `venue-signature` module, the filter predicate
  over 740 real rows.
- ✅ **Structural, extracted from source:** the two upsert conflict keys, the `.from()` census proving
  `truck_events` is untouched, the `InlineField` byte-identity, the inertness checks.
- 🔴 **Reasoned only, NOT OBSERVED:** that the table renders and reads well, that the column widths suit,
  that an inline edit round-trips in a browser. **No admin session is obtainable; no control was clicked
  and no edit was performed. I claim no write succeeded.**
