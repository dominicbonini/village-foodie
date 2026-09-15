# The outreach list's default sort — oldest first

**15 September 2026.** One file changed: `components/admin/OutreachPanel.tsx`. **One functional
character** (`'desc'` → `'asc'`) plus the comment that explains it. No migration, no template row, no
filter added or changed. Nothing staged or committed.

⚠️ **I CANNOT SEE A SCREEN.** Every ordering statement below is either a READ of the comparator or the
output of driving that comparator's **own extracted source** over a fixture.

---

# 🔴 PREMISE CORRECTION — ONE, AND IT IS THE CENTRAL WARNING IN THE BRIEF

## The comparator is NOT naive, and nulls were never going to rise to the top

The brief warns: *"Under oldest-first, a naive comparator may sort nulls to the TOP and bury all 9 dated
rows under 222 blanks."* **That risk is real in general and does not exist here.**

🔎 **READ**, `compareBySort`:
```ts
// Nulls last, ALWAYS — independent of direction.
if (va == null && vb == null) return 0
if (va == null) return 1
if (vb == null) return -1
let cmp: number
…
return s.dir === 'asc' ? cmp : -cmp        // ← the direction is applied AFTER, and never to a null
```
The null branches **return before** the direction negation, so `-cmp` can never touch one.

🔴 **I did not stop at reading it.** A comment claiming "nulls last, ALWAYS" is exactly the kind of
assertion this codebase has been burned by — §35.z records a guarantee stated in a comment that the code
did not provide. So the harness below **drives the real comparator** and, as a control, drives a
**deliberately naive variant** with the null tests moved after the direction. 🧪 The naive variant fails;
the shipped one does not.

**Consequence: no change to the null handling was needed, and none was made.** The one line named in the
previous report was the whole change.

---

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .github/workflows/discovery_prune.yml
	modified:   app/api/admin/outreach-templates/route.ts
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/admin/TemplatesPanel.tsx
	modified:   docs/scraper-reference-manual.md
	modified:   ios/App/App/Info.plist
	modified:   lib/outreach-template-render.ts
	modified:   lib/outreach.ts
	modified:   scripts/prune-discovery-events.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-config-build-report.md
	docs/outreach-config-review-report.md
	docs/outreach-lead-type-freeze-report.md
	docs/outreach-list-columns-report.md
	docs/outreach-list-view-report.md
	docs/outreach-queue-report.md
	docs/outreach-sequence-review-report.md
	lib/outreach-globals.ts
	lib/outreach-step.ts
	supabase/migrations/20260914_outreach_lead_type_freeze.sql
	supabase/migrations/20260915_outreach_template_tags.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

🔴 **Nothing new is committed.** `HEAD` is still `e8b59e5`; seven bodies of work sit in the tree.
⚠️ **`ios/App/App/Info.plist` is modified and belongs to none of this work. Untouched, reported again.**

### Admin-only — confirmed

`OutreachPanel` ← `app/admin/page.tsx` only (`app/admin/outreach/page.tsx` is a server `redirect`).
`compareBySort`, `sortValue` and `toggleSort` are **module-local to that file and not exported** — 🧪
searched alone, they appear in no other file, so this change cannot reach another surface.
🔴 **Nothing shared was touched:** `lib/whatsapp-hint.ts` (customer-facing live button) and
`components/admin/InlineField.tsx` both carry zero diff from this task.

---

# THE CHANGE

🔎 **The line the previous report named, re-read by symbol and changed:**

```diff
- const [sort, setSort] = useState<SortState>({ key: 'next_action', dir: 'desc' })
+ const [sort, setSort] = useState<SortState>({ key: 'next_action', dir: 'asc' })
```

🧪 **One functional character.** `git diff` shows exactly one added `dir: 'asc'`; everything else in the
hunk is the comment block, rewritten so it describes what the code now does rather than what it used to.

**Why `asc` is oldest-first, READ rather than assumed:** `sortValue` returns
`p.next_action_at || null` — a `'YYYY-MM-DD'` string — and `compareBySort` orders non-null values with
`localeCompare`. For ISO dates, lexical ascending *is* chronological ascending. 🧪 Confirmed by the
harness rather than by reasoning alone.

## Where the 222 nulls go — LAST, in both directions

🔎 A null `next_action_at` means **"no action scheduled"**, not "overdue since the beginning of time",
and the comparator already encodes that. 🧪 Driven over Dominic's stated shape, **the first null appears
at position 10** under `asc` — and also at position 10 under `desc`. Flipping the direction promotes no
null.

## The header toggle — what the sequence actually is

🔎 `toggleSort` is unchanged. Simulated from its own reducer, starting at the new default:

| | state | order |
|---|---|---|
| **page load** | `{ next_action, asc }` | **oldest first** |
| click 1 | `{ next_action, desc }` | newest first |
| click 2 | **`null`** | 🔴 the **5-way priority sort**, not the load state |
| click 3 | `{ next_action, asc }` | oldest first |
| click 4 | `{ next_action, desc }` | newest first |

**So: oldest → newest → priority sort → oldest → …**, a three-position cycle.

⚠️ **ONE WRINKLE, REPORTED AND DELIBERATELY NOT FIXED.** The third position is `sort = null`, which the
code treats as "the default priority rank" (Hatches Up + has email + not contacted first). That is a
*different* ordering from the one the page loads in, so "clear" lands somewhere the operator never saw
on load and cannot return to by clearing again. **This is pre-existing `toggleSort` behaviour, not
something this change introduced** — it was equally true when the default was `desc`, except that it
took one click to reach instead of two.

🔴 **The brief said to change the one line, not the sort model, so I did not touch it.** If "clear"
should return to oldest-first rather than the priority rank, that is a change to `toggleSort`'s third
branch — say the word.

---

# ⚠️ "SHOW ITEMS AFTER TODAY" — REPORTED ONLY, NOTHING ADDED OR CHANGED

**Yes, there is date-based exclusion, and it is in the Due work gate.** 🔎 READ:

```ts
const state = !dueOn ? 'due' : dueOn <= ymd ? 'due' : 'scheduled'     // lib/outreach-step.ts
export const needsAttention = (s) => s.state === 'due' || s.state === 'unknown'
```

| Surface | Excludes by date? | What it excludes |
|---|---|---|
| **The All view** | ❌ no | nothing — every row is shown |
| **Due work** | 🔴 **YES** | a step whose due date is **after today** is `scheduled`, and `needsAttention` is false for it. 🧪 Per Dominic's figures that is the **2 rows dated ahead** |
| The `nextAction` filter | only when set | `'any'` (the default) filters nothing; `'overdue'`, `'scheduled'`, `'none'` are user choices |

🔴 **CRUCIALLY, NOTHING HIDES AN OVERDUE ROW.** `dueOn <= today` is `'due'`, so every overdue prospect
stays in Due work — the new sort's whole point is preserved there. **A filter that hid overdue rows
would defeat this change, and none exists.**

⚠️ **So "show items after today" is the opposite of what Due work does today** — it deliberately hides
future-dated work so the queue is what can be actioned now. If Dominic wants those 2 rows visible, the
existing routes are the **All** view (shows everything) or the `nextAction = scheduled` filter (shows
only them). **I added nothing and changed nothing here.**

---

# VERIFICATION

## The instrument, and what a meaningless green would look like

🔴 **The harness runs the component's OWN comparator, extracted verbatim.** A hand-written copy would
prove only that I can write a comparator, which is not the question. `extract.cjs` reads
`OutreachPanel.tsx`, brace-matches `sortValue` and `compareBySort` out of it, reads the declared default
from the `useState<SortState>` call, and hands the result to the repo's own `tsc`. **Nothing is retyped,
and the expected default is read from the file rather than asserted.**

*Null results this could produce, and how each is excluded:*

| Risk | Excluded by |
|---|---|
| The fixture's **input order is already the answer**, so even an inert comparator "passes" | 🔴 **The fixture is shuffled** (deterministic seed). 🧪 The inert control shows a null at **position 2** under input order — so ordering is doing the work |
| The extraction silently grabs the wrong text | The default read out of the file is printed and asserted; a mutation to it fails the run |
| Every assertion passes because everything sorts to one bucket | The `asc` and `desc` runs are asserted to **differ**, and both are printed |

## The fixture

🔴 **The counts and the oldest date are Dominic's, from the brief:** 231 prospects, 9 dated — 6 overdue,
1 due today, 2 ahead — 222 null, oldest dated row `2026-09-13`.
⚠️ **The individual dates inside the overdue band are mine**, chosen only to satisfy those constraints
(6 rows strictly before today, oldest `2026-09-13`). **They are not a claim about the database**, and
this harness measures ordering, not distribution. 🧪 The counts are asserted before anything is sorted.

## The result — the first five rows under the shipped default

```
   DEFAULT_SORT read from the component: {"key":"next_action","dir":"asc"}
   1. 2026-09-13  Dated 0
   2. 2026-09-13  Dated 1
   3. 2026-09-13  Dated 2
   4. 2026-09-14  Dated 3
   5. 2026-09-14  Dated 4
   first null appears at position 10
```
✅ the TOP row is the oldest dated one · none of the first five is a null · all 9 dated rows precede any
null · the furthest-future row is **ninth** · the 9 dated rows are in non-decreasing date order.

## The control — the pre-change direction produces the reverse

```
   'desc' first five:
   1. 2026-09-17   2. 2026-09-16   3. 2026-09-15   4. 2026-09-14   5. 2026-09-14
   'desc': first null at position 10
```
✅ `desc` puts the furthest-future row on top and the most overdue row **ninth** — which is why it
changed. ✅ **Nulls land at position 10 in BOTH directions** — the premise correction, measured.

## Broken variants — the harness must fail

```
BROKEN VARIANT                                        exit
default left at desc (the pre-change state)             1  ✗ the component ships { next_action, asc }
🔴 NAIVE comparator: nulls handled AFTER the direction  1  ✗ the TOP row is the oldest dated one
nulls sorted FIRST outright                             1  ✗ none of the first five is a null
next_action reads the wrong field                       1  ✗ 'desc' puts the furthest-future row on top
                          ── the real comparator ──     0  ✅ ALL CHECKS PASSED
```

🔴 **The second variant is the brief's exact warning, built and run.** It moves the null tests after the
direction so `asc` promotes nulls — and the harness catches it. **That is what makes "nulls land last"
a measurement rather than a quotation of a comment.**

⚠️ **ONE ASSERTION OF MINE WAS WRONG AND IS RECORDED RATHER THAN QUIETLY FIXED.** The first version of
the null-result control read *"an inert comparator leaves input order (a dated row first only by luck of
construction)"* and **failed** — because at that point the fixture listed all 9 dated rows first, so the
input order WAS the expected answer and an inert comparator would have passed every ordering assertion.
**The fixture was the weakness, not the control.** Shuffling it fixed both, and strengthened every other
assertion in the file.

## Nothing else moved

- 🧪 **Modal mobile rounds 1–3 intact:** `max-sm:` classes removed vs HEAD **0**; `ProspectMetaFacts` ×3,
  the `contents max-sm:hidden` wrapper ×1, the `sm:hidden` phone copy ×1, `max-sm:grid-cols-2` ×1,
  `max-sm:min-w-0` ×10.
- 🧪 **Phases 1–3 of the last build untouched:** the Escape draft guard, `effectiveKind = servesKind ??
  kind`, the global-defaults merge, `listView` (8 references) and `needsAttention` all present and
  unedited. **No file other than `OutreachPanel.tsx` was written by this task.**
- 🔴 **The Due work gate, the "Needs details" view and the column set are unchanged.**

## tsc and lint

`tsc --noEmit -p .` → **exit 0**.

```
                                         HEAD    now
@typescript-eslint/no-explicit-any         18     18
react-hooks/set-state-in-effect            11     11
react-hooks/immutability                    1      1
react-hooks/exhaustive-deps                 1      1
@typescript-eslint/no-unsafe-function-type  1      1
@typescript-eslint/no-unused-vars           1      0   ← removed by an earlier task, already declared
```
**No finding added by this task.** ⚠️ The baseline is **like-for-like** — the same file set, with the two
untracked libs moved aside for the HEAD run. (The "15" printed in two earlier reports came from a
smaller file set; 18 is the correct figure, corrected in the last report and repeated here.)

---

# CHECKLIST

- **S1.** 🔴 Reload the outreach console. The **NEXT ACTION** column should be the active sort (orange
  header, ▲), with the **most overdue** row at the top.
- **S2.** The dated rows run oldest → newest down the first nine positions; the two future-dated rows are
  eighth and ninth.
- **S3.** 🔴 **Row ten onwards is dashes.** If you see a dash at the top, the null handling has moved and
  I want to know immediately.
- **S4.** Click the **NEXT ACTION** header once → newest first (▼). Click again → the list jumps to the
  **priority sort** (Hatches Up + email + not contacted first), which is *not* what you loaded into.
  Click a third time → back to oldest first. ⚠️ Tell me if that middle state should instead return to
  oldest-first; it is one branch of `toggleSort`.
- **S5.** Switch to **Due work**. The ordering is the same, but the 2 future-dated rows are **not there**
  — that gate excludes `scheduled`. Overdue rows are all still present.
- **S6.** Sorting by any other column still works, and a third click on it still clears to the priority
  sort.

---

# SQL — for Dominic to run; **nothing here was executed**

🔴 **Neither query writes anything.** ⚠️ And per the standing rule I have not reasoned about what is
applied from any migration file's header — query 2 exists precisely because that is the only honest way
to find out.

**1 · What the first ten rows will actually be** — the live equivalent of the harness's fixture, so the
screen can be checked against the database rather than against my assumptions:

```sql
select t.name,
       p.next_action_at,
       case
         when p.next_action_at is null then 'no date — sorts last'
         when p.next_action_at < current_date then 'overdue'
         when p.next_action_at = current_date then 'due today'
         else 'ahead'
       end as band
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where p.next_action_at is not null
 order by p.next_action_at asc, t.name
 limit 10;
```

⚠️ **`where … is not null` is deliberate**: the app sorts nulls last, so they cannot appear in the first
ten while any dated row exists. If this returns fewer than 10 rows, that is the complete dated set and
everything below it on screen is a dash.

**2 · 🔴 IS THE TEMPLATE-TAGGING MIGRATION APPLIED?** The brief says not to assume either way, and a file
header is not evidence. This is the only reliable answer:

```sql
select c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'outreach_templates'
   and c.column_name in ('serves_kind', 'serves_lead_type')
 order by c.column_name;
```

⚠️ **Two rows = applied.** Zero rows = not applied — run
`supabase/migrations/20260915_outreach_template_tags.sql` **including its final
`notify pgrst, 'reload schema';`**, which is what the lead-type column needed before the app could see
it. 🔴 **If it returns two rows but the Templates tab still shows the tag dropdowns greyed out, that is
the PostgREST schema cache again and the `notify` alone fixes it** — the server log now names the code.
