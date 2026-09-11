# Outreach Schedule cell → the truck's events, editable

---

# 0. 🔴 WHERE THE BRIEF AND THE DATA DISAGREE — READ FIRST

## 0.1 The brief says 103 trucks are `Y (0)`. 🧪 Today there is **1**.

Re-derived live (count-asserted: header total = rows fetched for all three tables — events **903/903**,
prospects **231/231**, discovery_trucks **231/231**), using the route's own rule:

| Schedule state | prospects |
|---|---|
| `Y (n>0)` — events ahead | **58** |
| `Y (0)` — a schedule, nothing ahead | **1** |
| `N` — nothing known at all | **172** |

**The one `Y (0)` truck is `Test Kitchen`** (0 future, 50 past, last event 2026-08-31).

🔎 **Why, and it is not a mystery:** `Y (0)` requires a truck whose events are *all past*. 🧪 Only **156**
past-dated rows survive, spanning just **4 distinct truck-name keys**, so 103 is arithmetically
unreachable. This is the same collapse recorded in `docs/discovery-events-delete-report.md` §0.2 — the
table went from ~3,600 past-dated rows to 156 while future rows stayed put. **Trucks whose only events
were past flipped from `Y (0)` to `N`.**

⚠️ **This changes none of the requirements.** `Y (0)` must still be clickable and must still explain
itself — it is just currently a population of one. If those past rows ever come back, so do the other 102.

## 0.2 The brief's description of the two matchers is exactly right, and it matters

Confirmed by reading both. The count uses **trim + lowercase, exact membership** over name + aliases; the
orphan flag uses **`normalizeVenue` + `venuesFuzzyMatch`**, which additionally strips filler words, chops
plurals, and matches on Levenshtein-1 *plus substring containment*. 🧪 They disagree on **5 of 231**
trucks. Full numbers in §4.

---

# 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/InlineField.tsx
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
```

`git add -A` / `git add .` were not run; nothing was staged.

## 1.1 🔴 SCOPE CHANGED MID-TASK — recorded, not silently absorbed

The brief said **"NOT IN SCOPE: delete from this popup (it is being built on the Events tab separately)"**.
Two messages arrived while the work was running:

1. *"there needs to be the delete button when opening the truck schedules. also order by date and time so
   if 2 on same day earlier start is first. this should be for both screens"*
2. *"when i am on the event popup and scroll, the outreach page behind scrolls and the header showing
   column names like logo goes in front of the event"*

Both were built. **The delete control in the popup is a deliberate reversal of the brief's own exclusion,
on your instruction** — flagged here so the contradiction with §"NOT IN SCOPE" is on the record rather
than looking like scope creep. Nothing else in the exclusion list (bulk edit, scraper changes) was touched.

---

# 2. DIAGNOSIS

## 2.1 Which matcher the count uses — confirmed, by symbol

🔎 `app/api/admin/outreach/route.ts`:

- `norm` (`:29` pre-edit) — `(s ?? '').trim().toLowerCase()`. Nothing else.
- `buildScheduleIndex` (`:33`) — pages all of `discovery_events`, keys the index on `norm(truck_name)`,
  and counts `event_date >= todayYMD` into `futureCount`, tracking `lastEventDate` as the max over **all**
  dates.
- `scheduleFor` (`:66`) — unions `norm(name)` with `norm(alias)` for every alias, then sums `futureCount`
  across those keys and takes the max `lastEventDate`.

**So the cell's number is: events whose trimmed-lowercased `truck_name` is exactly one of the truck's
normalised name/alias keys, dated today or later.**

### How the popup calls the SAME function

`norm` and the key-set construction were **MOVED**, verbatim, into `lib/schedule-match.ts` as
`scheduleNorm` / `scheduleKeys` / `eventMatchesKeys`. The outreach route now calls them; so does the
events route when filtering the popup's rows. **One definition, two callers.**

🔴 **This is not a sixth normaliser.** The five documented ones are unchanged in number and behaviour —
one of them now lives in a module instead of inside a route file. 🧪 Proven equivalent in §4 (P1).

## 2.2 Which route the popup uses — the Events tab's, for both read and write

**Read and write both go to `/api/admin/discovery-events`.**

- **Write** — mandated by the brief and correct: the popup sends the **same `update_event` action** the
  Events tab sends. 🧪 There is exactly one `body?.action !== 'update_event'` guard in the route and now
  exactly **one** client function that builds that request (`postEventUpdate`), used by both tables. No
  second update path for `discovery_events` exists.
- **Read** — the events route, extended with an optional `truck_id` parameter. It is the route that
  already computes the **orphan** and **no-venue** flags; reproducing those in the outreach route would
  have duplicated the orphan matcher, which is precisely the thing that must not be forked. Adding the
  filter here keeps one implementation of each.

⚠️ Filtering happens **in memory**, not in SQL, because the keys are trim+lowercased and PostgREST cannot
express `lower(btrim(truck_name)) IN (…)` without a view or RPC — the same reason `buildScheduleIndex`
builds its index in memory over the same table.

## 2.3 Can the Events tab's row UI be shared? — Yes, and the line is drawn deliberately

§51.7 records **both** mistakes: a "reuse" that was a fourth independent implementation, and collapsing
things that should have stayed separate. Both risks are live here, and they apply to different parts:

| | verdict |
|---|---|
| **The seven cells of an event row** — same columns, same six editable fields, same route action, same flags | **SHARED** (`components/admin/EventRowCells.tsx`). Two copies would drift: a column added to one and the other silently disagrees about what an event is. |
| Filter bar, source dropdown, n-of-N counts, scope toggle, sticky header, column widths | **NOT shared.** They belong to a full-page tab. |

🔴 **The collapse I refused:** one component taking `showFilters` / `showDelete` / `showCounts` booleans
to serve both surfaces. That is one component with two personalities and a flag for each — the §51.7
error in its second form. The popup builds its own chrome and reuses only the row.

Also genuinely shared, for the same anti-drift reason: `UpsertWarning` (**the tab's exact existing
wording**, moved so both surfaces cannot say different things), `byDateThenTime`, `fmtEventDate`, `hhmm`,
and `postEventUpdate`.

---

# 3. WHAT WAS BUILT

## 3.1 The number is a control

The `(n)` in the Schedule cell is a real `<button>` — in the tab order, focusable, Enter and Space for
free. Only the number: the `Y` stays a `<span>`, and **`N` renders no button at all**, because there is
nothing to show.

🔴 **How it is kept from opening the prospect modal.** The modal is opened **only** by the truck-name
button, which lives in a **different `<td>`. 🧪 The `<tr>` carries no `onClick` and there is no ancestor
click handler anywhere between the schedule cell and the table** — so there is nothing for a click to
bubble into. `ev.stopPropagation()` is on the handler as belt-and-braces against a row-level handler being
added later; **the separation does not depend on it today**, and I would rather say that than imply the
guard is what makes it work.

🔴 **`Y (0)` is clickable, and opens on "All dates"** — a truck with nothing ahead has, by definition,
zero future rows, so the future view would be empty and explain nothing. The popup also prints a line
saying why: *"Nothing is booked ahead for this truck, so the list opens on all dates — these are its past
events."* 🧪 `Test Kitchen`: 0 future, **50 past rows shown**.

## 3.2 The popup

Same seven columns as the Events tab plus a delete column; default **future-dated, soonest first**, with
an **All dates** toggle — matching the tab's default so the two never disagree. Orphan and no-venue flags
render from the same shared cell component, so they cannot diverge.

## 3.3 Inline edit — same six fields, server still the authority

`truck_name`, `venue_name`, `village`, `start_time`, `end_time`, `event_notes`. `source` and `event_date`
render read-only; both FKs are not rendered at all. The route's `EDITABLE` allow-list remains the
authority — the component cannot widen what is writable even if it rendered a field it should not.
The **amber upsert warning** shows here too, and is now literally the same component as the tab's.

## 3.4 🔴 Editing `truck_name` can move a row out of the popup — what actually happens

**The membership set is frozen for the life of the popup.** The row is updated in place and is **not**
re-filtered out, so it does not vanish mid-edit. Instead the Flags cell gains an orange **`moved`** chip
whose tooltip says the row will not appear here when the popup is re-opened and that the Schedule count is
now out of date. Re-opening applies the filter again and the row is correctly gone.

**Is this the outreach table's freeze?** *Related, not identical, and I would rather name the difference.*
The outreach table freezes its row list **while an input has focus** and releases on blur. That is not
enough here: a truck-name edit changes membership **permanently**, so releasing on blur would still make
the row disappear the instant it was corrected. So the popup keeps the same `onHold` wiring that
`InlineField` requires, and additionally freezes membership for the whole popup session. **The change is
made visible rather than silent** — the failure being avoided is a row that vanishes and leaves the
operator unsure whether their edit saved.

## 3.5 🔴 (4) The Schedule count does **not** live-update — and says so

**Plainly: the count refreshes only on reload.** `futureEventCount` is derived server-side from the whole
events table; this client cannot recompute it without re-reading that table, and guessing would be a
second source of truth that could be wrong.

So instead of a silent disagreement, the cell **admits** it: any edit that can change the count — a
`truck_name` change, or a delete — marks that prospect's count stale and the cell renders a small orange
**`stale`** marker until the list is reloaded. An out-of-date number that says it is out of date is safe;
one that quietly disagrees with the popup is the failure the brief named.

## 3.6 Added after your mid-task messages

- **Delete in the popup** — the same `ConfirmDeleteDialog`, the same `DELETE /api/admin/discovery-events`
  route, and the same server-confirmation guard as the Events tab: the row leaves the list only if the
  server reports `deletedCount >= 1`. The same past/future warning applies, decided from the **server's**
  `today` (returned by the GET), never the browser clock. A delete always marks the count stale.
- **Ordering: date, then start time, then id — on both screens.** One shared comparator
  (`byDateThenTime`), used by the Events tab, the popup, and mirrored in the route's own
  `.order()` chain. ⚠️ **A blank `start_time` sorts LAST within its day**, not first: `''` compares below
  every real time and would float unscheduled rows to the top of the day, which is the opposite of useful.
- **The popup now portals to `<body>` and locks background scroll.** Rendered in place it was a descendant
  of the outreach panel, so its z-index competed only inside its ancestors' stacking context — which is
  why the admin tab bar (`sticky top-[51px] z-40`, `app/admin/page.tsx:838`) and the outreach table's
  `sticky top-0 z-10` header painted **over** it. A portal makes it a direct child of `<body>`, and it is
  now `z-[80]`. Background scroll is locked by setting `body.style.overflow` and **restoring the previous
  value**, not resetting it to `''`. 🧪 The `ConfirmDeleteDialog` is a descendant of that `z-[80]`
  backdrop, so its own `z-[70]` still paints above the popup panel — verified structurally in §4 (P10).

---

# 4. 🔴 PROOFS — AND WHAT EACH FAILURE WOULD HAVE LOOKED LIKE

**P1 · The refactor changed no count.** Old inline logic vs the shared module, over all **231** prospects:
**0 differ** in `futureCount` or `lastEventDate`.
*Failure mode:* a "tidy-up" that silently moves every number on the screen. *Ruled out by* running both
implementations over live data rather than reading them.

**P2 · The popup's row count equals the cell's number.** For all **231** prospects, rows returned under
`scope=future` == `Y (n)`: **0 mismatches**.

**P3 · 🔴 The right ROWS, not just the right count.** The brief is explicit that a matching count proves
nothing about row identity. Over the **901** rows the popups would collectively show: **0 false
inclusions** (every shown row's normalised name is in the truck's key set) and **0 false exclusions** (no
event outside a popup matches that popup's keys).
*Failure mode:* two different rows counted as "5" and "5" while being different fives. *Ruled out by*
comparing membership per row, not cardinality.

**P4 · 🔴 The filter-never-fires failure.** A filter that matches everything returns all 903 rows and looks
like a working list. Tested with degenerate key sets: `name=""` → keys 0, **0 rows**; `name="   ",
alias=""` → keys 0, **0 rows**; `name=null` → keys 0, **0 rows**. `eventMatchesKeys` returns false for an
empty set rather than falling through. 🧪 (0 events currently have a blank `truck_name`, so this guard is
protection against a future row, not a live save.)

**P5 · 🔴 The named witness — what the WRONG matcher would have done.** Using the orphan/fuzzy matcher
instead, **5 of 231** trucks would contradict their own cell:

| truck | cell | fuzzy popup would list |
|---|---|---|
| **Between Buns** | `Y (5)` | **10** |
| Eat Is Greek | `N` | 6 |
| The Shack Street Food | `N` | 3 |
| Between Buns Royston | `Y (5)` | 10 |
| Kerief Catering Ltd | `N` | 1 |

⚠️ `The Shack Street Food`'s extra 3 belong to **`The Foodie Shack` — a different business** (the fuzzy
rule strips "the/street/food" then matches by containment). This is why the permissive matcher is right
for the orphan flag and wrong here.

**P6 · Ordering.** The shipped comparator, extracted from source and run over all **903** rows: **0
ordering violations**. **101** days carry more than one event with differing start times. Sample
`2026-05-28`: `17:00 Real Thai Food` then `(blank) Pizzeria Gusto` — blanks last, as intended.

**P7 · 🔴 Observed live, from your screenshot.** `Steak & Honour` rendered *"7 events · cell shows Y (7)"*
and listed 9 Sep 17:00 → 10 Sep 12:00 → 10 Sep 17:45 → 11 Sep 12:00 → 11 Sep 17:00 → 12 Sep 17:00 ×2. 🧪
Cross-checked against live data: that truck has **3 alias keys** (`steak & honour`, `steak and honour`,
`steak & honor`) and exactly **7** future rows under the count matcher. **The count, the rows and the
ordering agreed on a real truck with real aliases** — the only part of this work observed running.

**P8 · One writer.** Exactly one `update_event` guard in the route; exactly one client function building
that request; both tables call it. The popup's delete reuses the existing `DELETE` handler.

**P9 · The popup's delete guard.** The shipped `removeEvent`, extracted and executed against four server
responses: confirmed-delete removes the row and reports `onEdited(true)`; `deletedCount: 0`, `404` and
`500` all leave the row in place, throw the server's sentence, and report nothing. **4/4.**
*Failure mode:* a row that disappears from the list after a delete that never reached the database.

**P10 · Stacking and scroll.** The `ConfirmDeleteDialog` is structurally inside the `z-[80]` backdrop
subtree, so its `z-[70]` is compared inside the popup's own stacking context and still paints above the
panel. Scroll lock captures and restores the prior `body.style.overflow`.

**P11 · `truck_events` is never touched.** Non-comment occurrences across all seven files touched:
**0, 0, 0, 0, 0, 0, 0.**

**P12 · The do-not-touch surfaces are unchanged.** Occurrence counts before vs after in `OutreachPanel`:
`matchesOutreachFilter` 4/4, `MediaCell` 4/4, `uploadMedia` 3/3, `deleteMedia` 2/2,
`EMPTY_OUTREACH_FILTER` 5/5, `TriStateBox` 4/4. The diff is confined to the schedule cell, the `Row`
signature, two pieces of state and the popup mount.

**P13 · Column arithmetic, re-derived.** Popup colgroup `[170,110,116,180,130,130,150,56]` **sum = 1042**,
`minWidth = 1042` — surplus **0**. Events tab `[190,110,120,200,140,150,150,56]` **sum = 1116**,
`minWidth = 1116` — surplus **0**. `table-fixed` spreads any surplus across every column, which is how
columns silently widened in an earlier task.

**P14 · 🔴 Styling can TAKE EFFECT.** The unlayered `!important` rule targets `input[type=…]`, `select`,
`textarea` — **not `button`**, measured last session (button `text-xs` → **12px**; the same class on a
`select`/`input` → 16px, inert). 🧪 The two new components contain **zero** `<input>`, `<select>` or
`<textarea>` of their own — every field is the shared `InlineField`, so the inert-`text-sm` behaviour in
the popup is *identical to the Events tab's* by construction rather than by luck.

**P15 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** after every step. No `next build` — your dev
server is live.

---

# 5. EVIDENCE CLASS

- ✅ **Executed against live data:** the 58/1/172 state split; 903/231/231 count-asserted fetches; P1–P6
  (refactor equivalence, count agreement, row identity, degenerate filters, the 5-truck disagreement, the
  ordering sweep); the Steak & Honour cross-check.
- ✅ **Executed against stubs:** P9's four delete responses — real shipped source, simulated server.
- ✅ **Observed running:** P7 only, and only via the screenshot you supplied.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the matcher trace, the one-writer census, P10–P14.
- 🔴 **Reasoned only, NOT OBSERVED:** that the delete control reads well in the popup, that the `moved` and
  `stale` markers are noticed, that the portal fix resolves the overlap on your screen — **the z-index and
  scroll-lock changes were made after your screenshot and have not been seen rendered.** No admin session
  is obtainable here; I clicked nothing and deleted nothing, and I claim no write succeeded.
- ⚠️ **Unrelated:** a background command from an earlier task ("Correctly paginate and find the vendor
  email rows") reported failure during this work. It touched nothing here.
