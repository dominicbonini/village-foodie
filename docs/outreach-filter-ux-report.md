# Outreach filter bar — ordering, active-filter chips, and four mid-task changes

**9 September 2026 · UX only.** Two files touched: `components/admin/OutreachPanel.tsx` and
`lib/outreach-filter.ts`. **No schema change, no migration, no data write, no new endpoint, no query
param, no refetch. Nothing installed; `package.json` and the lockfile are untouched.** Nothing staged,
committed or pushed; `git add` was not run in any form.

---

## 0. `git status` VERBATIM, BEFORE ANY EDIT

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-table-report.md
	lib/outreach-filter.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

### 🔴 SEPARABILITY — I stopped and asked, and you chose

The pending `components/admin/OutreachPanel.tsx` was the **predecessor task's** filter bar, still
unstaged, and **HEAD contains no filter bar at all**. Every line this task reorders or wraps in chips is a
line that exists *only* in that pending work, so `git add -p` cannot put a hunk boundary between the two.
**That tripped the STOP condition, so I asked rather than choosing**; you chose *"Proceed — one combined
feature"*.

✅ **Nothing else is entangled.** At END: one modified file, two untracked files (one of which is this
report). 🧪 `git diff --cached --stat` is **empty** — the index was never touched. 🧪 A scoped
`git status --short` over `app/manage`, `app/order`, `app/trucks`, `app/o`, `app/api/manage`,
`app/api/inbound-schedule`, `components/dashboard`, `lib/schedule-extract.ts`, `lib/whatsapp-hint.ts`,
`package.json` and `package-lock.json` returns **nothing**. **No customer-facing or operator-facing
surface was touched, so nothing here can reach Pizzeria Gusto.**

---

## 1. DIAGNOSIS (reported before any code was written)

### 1.1 Column header order, read from `COLUMNS`

`Truck · Phone · WhatsApp · Email · HU map · HU ordering · Schedule · Stage · Last contacted · Next action`
— **10 columns.** ⚠️ *(This is the order as found. You later asked for HU ordering before HU map — §3.1.)*

### 1.2 Filter control order, as rendered

`search box · HU ordering · HU map · WhatsApp · Do not contact · Email · Phone · Stage · Schedule`
— **9 controls.** ⚠️ The search box was **not in the bar at all**: it sat in the header flex row opposite
the count line, so making it first meant physically moving it into the bar.

### 1.3 The gaps

- **Filters with no column: `do_not_contact`, and only that one.** 🧪 It has no `<th>` — it renders as the
  🚫 DNC chip *inside* the Truck cell and as a toggle in the modal. **I found no others**, so the
  end-of-bar rule applies to exactly one control.
- **Columns with no filter: `Last contacted` and `Next action`** (both date columns). ⚠️ **You then asked
  for a Next action filter mid-task**, which closes one of the two — §3.2.

---

## 2. THE TWO REQUESTED CHANGES

### (1) The bar ordered to match the columns

🔴 **The order is not hand-maintained.** A single module-scope `FILTER_CONTROLS` array is declared in
**column order**, and the bar `.map()`s over it. Columns with no filter are skipped; a filter with no
column carries `noColumn: true` and sorts last. **The search box renders first, inside the bar, labelled
`Truck`**, because it filters column 1.

⚠️ **I did not put any control in a header.** 🧪 Proven, not asserted: after stripping JSX comments, the
`<thead>` block contains **no** `<input>`, `<select>`, `FilterSelect`, `FilterChip`, `setF(` or `filter.`
— only `toggleSort`. The headers remain the sort control.

### (2) Active-filter chips and Clear all

Rendered inside the bar under a hairline divider, **only when `isFilterActive(filter)`** — the existing
helper, unchanged. One chip per non-default filter, reading as **column label + chosen value**
(`HU ordering  Yes`, `Schedule  Y (0) — none ahead`, `Truck  "pizza"`). **Clear all** resets to
`EMPTY_OUTREACH_FILTER`, search box included.

🔴 **The chips are a projection of filter state, not a second copy.** Both the bar and the chip list map
over the **same `FILTER_CONTROLS`** and read the **same `filter` object**; a chip's dismiss calls
`setF(key, 'any')` — **the identical setter a control calls**. There is no chip state, no `useEffect`
syncing anything, and therefore **no path by which a chip and its control can disagree**: a chip cannot
exist for a filter that is unset, nor fail to exist for one that is set.

**Chips are real `<button>`s** — focusable, in the tab order, activating on **Enter and Space** natively,
with `focus:ring-2` and an `aria-label` of `Clear filter <label>: <value>`. Not divs with handlers.

✅ **The "n of N trucks" count line is unchanged.**

---

## 3. THE FOUR MID-TASK CHANGES YOU ASKED FOR

### 3.1 "on the table, put HU ordering before HU map"

⚠️ **This reverses the brief's "do not reorder the table columns; the columns are the fixed reference."**
Your later instruction supersedes it, so I swapped the **table** and let the bar follow.

🔴 **Four parallel lists had to move together, and getting one wrong silently renders values under the
wrong heading.** All four were changed: `COLUMNS`, the `<colgroup>` (so the **110px/92px widths travel
with their columns**), the `Row`'s two `<td>`s, and `FILTER_CONTROLS`.

### 3.2 "for filter also need to sort by next action"

I read this as a **filter** on Next action — sorting on that column already existed — and it closes one of
the two filterless columns from §1.3.

⚠️ **This required adding a clause to `matchesOutreachFilter`, which the brief told me not to edit.** The
constraint's stated purpose was to protect the **existing** three-state and presence semantics; your
instruction asked for a new filter, and the module was built so that adding one is *"one entry in one
place"*. **I added a new clause and changed nothing above it** — proven in §4.3. **If you meant something
else by "sort by next action", this is the assumption to correct.**

**Four positions**, and ⚠️ **deliberately not tri-state**: `next_action_at` is a nullable **date**, so an
absent date means *no next action is scheduled* — a fact, not an unknown. Overdue uses **`isOverdue`, the
same helper behind the row's red ⚠ marker**, so the filter and the cell cannot disagree about "overdue".

### 3.3 "centre all the column headings"

The per-column `centred` test is gone; every `<th>` is `text-center` with `mx-auto` on the sort button.
🧪 Verified after stripping comments: **1 `<th>` template, centred unconditionally, no `text-left`
remaining, no `const centred` test.** ⚠️ Two earlier readings of this check were **false positives of my
own making** — `<thead` matches a naive `<th` search, and the word "centred" appears in the comment I had
just written. Re-checked precisely rather than reported as-is.

### 3.4 "centre the column details as well"

All **10** `<td>`s in `Row` now carry `text-center`, and the truck-name button's `text-left` became
`text-center mx-auto`. 🧪 Verified: 10 of 10 centred, **no `text-left` anywhere in the row**.

---

## 4. PROOFS — failure mode stated first, then how it was ruled out

### 4.1 🔴 The ordering: what a worthless proof looks like

**A reordered bar looks identical to one that was not reordered if I only assert they match**, and reading
the JSX by eye would miss a transposition. So both sequences are **extracted from the source after the
change** and compared **mechanically**: each filter is mapped to its column's index, and the resulting
sequence must be **strictly increasing**.

```
   TABLE COLUMNS (left→right)      FILTER BAR (left→right)
    1. Truck                     1. Truck
    2. Phone                     2. Phone
    3. WhatsApp                  3. WhatsApp
    4. Email                     4. Email
    5. HU ordering               5. HU ordering
    6. HU map                    6. HU map
    7. Schedule                  7. Schedule
    8. Stage                     8. Stage
    9. Last contacted               — no filter, skipped
   10. Next action               9. Next action
       (no column)              10. Do not contact   ← last

   column indices in bar order: [0, 1, 2, 3, 4, 5, 6, 7, 9]
   strictly increasing → bar matches columns: YES ✅
```

🔴 **AND THE CHECK CAN FAIL.** Fed the same checker a deliberately transposed order (Phone ↔ Schedule):

```
  REAL    seq=[0, 1, 2, 3, 4, 5, 6, 7, 9]  increasing: YES ✅
  MUTANT  seq=[0, 6, 2, 3, 4, 5, 1, 7, 9]  increasing: 🔴 NO
```

**It distinguishes them, so its passing is evidence rather than decoration.** ⚠️ My first attempt at this
mutation swapped the array by crude text slicing, which corrupted the parse and threw a `KeyError` instead
of reporting a clean failure — that attempt proved nothing and was replaced.

### 4.2 Header/colgroup/cell alignment after the HU swap

**Failure mode:** three parallel lists were edited independently; if any one disagreed, every value after
the mismatch would render under the wrong heading — and it would still compile and still look plausible.
🧪 All three extracted from source and compared position by position:

| # | header | colgroup | row `<td>` |
|---|---|---|---|
| 1–4 | name, phone, whatsapp, email | identical | identical |
| **5** | **hu_ordering** | **hu_ordering (110px)** | **hu_ordering** |
| **6** | **hu_map** | **hu_map (92px)** | **hu_map** |
| 7–10 | schedule, stage, last_contacted, next_action | identical | identical |

**counts: header 10, colgroup 10, cells 10 — all three agree ✅**, and the widths travelled with their
columns.

### 4.3 🔴 A/B: no existing predicate semantics changed

**Failure mode:** *"I only added a clause"* is exactly the claim that is easy to assert and easy to get
wrong. So I reconstructed the **pre-change predicate** by excising the new clause into a separate copy,
compiled **both**, and ran them over the **same rows**.

Rows re-derived fresh from the live tables using the route's own derivation. 🧪 **Pagination asserted
against `count=exact` headers: `discovery_events` 4,300 = 4,300 ✅; `outreach_prospects` 231 = 231 ✅.**

**All 19 pre-existing filter cases returned identical counts, before and after:**

| filter | rows | | filter | rows |
|---|---|---|---|---|
| huOrdering yes / unknown | 19 / 212 | | email yes / no | 55 / 176 |
| huMap yes / unknown | 121 / 110 | | phone yes / no | 69 / 162 |
| whatsapp yes / unknown | 30 / 201 | | stage contacted / not_contacted | 3 / 228 |
| doNotContact yes / unknown | 0 / 231 | | schedule upcoming / stale / none | 50 / 103 / 78 |
| search "pizza" | 28 | | AND huMap + email | 13 |

**🔴 ZERO of 19 changed.** ⚠️ Every figure above is **re-derived in this task**, not carried over from the
previous report.

⚠️ **`doNotContact = unknown` returns all 231 — my own "indistinguishable from no filter" flag fires
again.** It is **not** a broken predicate: 🧪 `do_not_contact` is NULL on all 231 rows, corroborated by the
`yes` position returning **0**. The data makes that position vacuous today; it stops being vacuous the
moment one truck is flagged. **Reported rather than presented as a pass.**

### 4.4 The new Next action filter, re-derived

🧪 Raw census of `next_action_at` across the 231 rows: **`{"none set": 230, "scheduled": 1}`**.

| position | rows | verdict |
|---|---|---|
| overdue | **0** of 231 | **EMPTY** — no truck has a past-dated next action today |
| scheduled | **1** of 231 | proper subset ✅ |
| none set | **230** of 231 | proper subset ✅ |
| partition | 0 + 1 + 230 = **231** ✅ | the three positions partition the list exactly |

⚠️ **`overdue` returns nothing today.** That is the data, not the predicate — the manual already records
`next_action_at` as set only by hand and never automatically, and only one row has one. **The partition
check is what shows the clause is running**: if it were inert, `none set` would have returned 231, not 230.

### 4.5 Compiler

🧪 `npx tsc --noEmit` → **0 errors**. 🧪 `npx next build` → **exit 0**, zero lines matching `error|failed`.

### 4.6 🔴 WHAT IS **NOT** PROVEN

**Nothing was rendered, clicked, focused or observed.** There is no `jsdom`, no test runner and no
`esbuild` in this repo, and installing one would modify `package.json` and the lockfile — which you stage
by hand and which this brief forbids. **I installed nothing.**

So, plainly:

- ✅ **Compiler-confirmed:** types, the build, and every structural claim extracted from the source (bar
  order, header/colgroup/cell alignment, centring, absence of controls in headers).
- ✅ **Executed against real data:** the predicate A/B and all counts — via a **direct service-role read of
  the tables replicating the route's derivation. That is not the route, and not the page.**
- 🔴 **Reasoned from source only, NEVER OBSERVED:** the bar's rendered appearance, the chips appearing and
  disappearing, a chip's dismiss actually resetting its control, Enter/Space activation, the focus ring,
  and the centring as it looks on screen. **No admin session is obtainable here** (manual V12.2,
  "NO ADMIN SURFACE CAN BE VERIFIED BEFORE THE OPERATOR SEES IT"), so **no control was clicked and no
  write or read was verified through the page.**

---

## 5. NOT TOUCHED

- **`matchesOutreachFilter`'s existing clauses** — the three-state handling, `'unknown'`-matches-NULL-only,
  and Any/Has/None for email and phone are byte-identical (§4.3 proves it behaviourally too).
- **The table's sort behaviour, `COLUMNS`' membership, the modal, the row's write paths**, the route, and
  every stage/tick/date write.
- ⚠️ **`Last contacted` still has no filter** — the one remaining filterless column, left alone because you
  asked only for Next action.
