# `reply` in both directions, Final chase, and the legacy fallback — report

Two files changed: **`lib/outreach.ts`** and **`components/admin/OutreachPanel.tsx`**. No route change, no
migration written or applied, nothing installed, `package.json` and the lockfile untouched. `git add -A` /
`git add .` were not run and nothing was staged.

No span of the prompt arrived garbled, and no instruction contradicted another — nothing needed stopping for.

**One number in the brief needs correcting before anything else, because it changes what §3 is about:** the
brief says *five* live rows still carry legacy values (two Tikka Tonic `follow_up`, three mislabelled
Azahar). Re-derived live, it is **eight of the ten rows**, spread across **all four** prospects — see §3.1.

---

## 0. `git status` before any edit, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/outreach.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	app/api/admin/outreach-templates/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	components/admin/TemplatesPanel.tsx
	docs/compose-single-pane-report.md
	docs/compose-window-stacking-report.md
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-compose-send-report.md
	docs/outreach-compose-window-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-history-table-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-kind-vocabulary-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
	docs/outreach-sequence-report.md
	docs/outreach-table-report.md
	docs/outreach-templates-report.md
	docs/outreach-templates-table-report.md
	docs/templates-layout-tweaks-report.md
	docs/templates-page-layout-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-template-render.ts
	lib/schedule-match.ts
	supabase/migrations/20260909_outreach_templates.sql
	supabase/migrations/20260910_outreach_contact_kinds.sql

no changes added to commit (use "git add" and/or "git commit -a")
```

---

## 1. `reply` is ungated — and the outbound case is the one that proves it

`lib/outreach.ts:65` — one word changed, `CONTACT_KINDS` → `CONTACT_KINDS_ALL`:

```ts
export const kindsForDirection = (direction: string): readonly string[] =>
  direction === 'inbound' ? [REPLY_KIND] : CONTACT_KINDS_ALL
```

Executed against the shipped module — an ungating that did nothing would show `reply` missing from the
first line:

```
kindsForDirection("outbound")                    ["1_first_contact","2_chase_1","3_chase_2","reply"]
  ...contains reply                              true
  ...as the picker renders it (sorted, labelled) ["First contact","Chase 1","Final chase","Reply"]
kindsForDirection("inbound")                     ["reply"]
defaultKindFor outbound / inbound                ["1_first_contact","reply"]
```

And rendered through the **shipped** `HistoryTable` (§3.3), an outbound `reply` row now reads
`9 Sept 2026 | Outbound | Reply | Email | View` — **no warning marker**, where before this change the same
row was flagged as a contradiction.

**It is still not a fourth touch**, and three separate mechanisms say so:

```
the ladder is still THREE rungs        3          ← CONTACT_KINDS unchanged
reply carries NO follow-up interval    null       ← FOLLOW_UP_DAYS is keyed on LadderKind; reply is not one
reply sorts outside the sequence       90         ← kindOrder; the rungs are 1, 2, 3
```

Switching Direction no longer throws the selection away in either direction: `reply` is in both lists, so
`kindsForDirection(d).includes(kind)` holds and the modal keeps Reply selected when you flip the direction
(`components/admin/OutreachPanel.tsx:1888`).

**This corrects the previous report, not the data.** `docs/outreach-kind-vocabulary-report.md` listed the
live Azahar row `46c6c4eb-3628-4843-b35a-af30e5fdd931` (outbound / `reply`) as a row to fix by hand. It was
the code that was wrong. **That row is now valid and needs nothing done to it.**

---

## 2. The ladder — 🔴 SUPERSEDED TWICE IN ONE SESSION; THIS IS THE CURRENT STATE

This section originally recorded `3_chase_2` being **relabelled** "Final chase" as a display-only change,
with the three-touch cap intact. Both halves were then reversed at your request, in two steps, and the
reversals are recorded here rather than quietly rewritten:

1. *"there needs to be a chase 2 as well after chase 1 in kind"* → the relabel was undone; `3_chase_2`
   displays as **Chase 2** again.
2. *"there still needs to be a final chase"* → since Chase 2 and Final chase cannot both be the third rung,
   **a fourth rung was added**: the new stored value `4_final_chase`.

🔴 **THIS RAISES THE TOUCH CAP FROM THREE TO FOUR.** A terminal "final chase" was explicitly refused as a
fourth stage twice before this session (`docs/outreach-sequence-report.md`, and again in the previous
brief: *"Three touches is a deliberate cap… Do NOT add a fourth stage"*). I raised the conflict before
building it rather than choosing on your behalf, and you chose four.

**The ladder now, executed against the shipped module:**

```
the ladder (stored values)    ["1_first_contact","2_chase_1","3_chase_2","4_final_chase"]
the picker, in kindOrder      ["First contact","Chase 1","Chase 2","Final chase","Reply"]
kindOrder                     {1_first_contact:1, 2_chase_1:2, 3_chase_2:3, 4_final_chase:4, reply:90}
intervals from a 10 Sep contact
                              {First contact: 2026-09-13,   ← +3, unchanged
                               Chase 1:       2026-09-17,   ← +7, unchanged
                               Chase 2:       2026-09-24,   ← +14, NEW — see below
                               Final chase:   null}         ← terminal; no date proposed
reply: still no interval, still outside the sequence   [null, 90]
isKind of every offered value                          [true,true,true,true,true]
```

⚠️ **`Chase 2` needed an interval and I chose one: +14 days. Tell me if it is wrong.** It was terminal
before (`null`) so it had nothing to inherit; 3 → 7 → 14 keeps the gaps widening as a sequence goes cold,
which is the shape the first two rungs already had. It is one number in `FOLLOW_UP_DAYS`.

**No migration is needed for the new value.** `kind` is `text` with no CHECK and no enum
(`20260903_outreach_tracking.sql:60`), and no live row carries `4_final_chase` (10 rows, none). `reply` is
unaffected: no rung, no interval, sorts at 90 — it cannot become a fifth touch.

## 3. Legacy values removed from the vocabulary — and what a legacy row now renders

### 3.1 What is actually in the table (re-derived, `content-range 0-9/10`, 10 of 10 fetched)

| id | truck | date | direction | stored `kind` | channel | |
|---|---|---|---|---|---|---|
| `f70e2a61-5839-46f4-a01e-d522efd308d3` | Pimp My Fish | 2026-09-08 | outbound | `first_contact` | email | outside |
| `1aa26b89-da4a-471a-8c2b-9fadb5b4f73f` | Pimp My Fish | 2026-09-10 | outbound | `2_chase_1` | email | **in** |
| `3cd8425e-93ad-4bf2-9f31-34ef4faa0901` | Azahar | 2026-09-09 | outbound | `first_contact` | email | outside |
| `076f3cb2-af88-4d27-ad06-e381619cd1c0` | Azahar | 2026-09-09 | **inbound** | `first_contact` | email | outside |
| `46c6c4eb-3628-4843-b35a-af30e5fdd931` | Azahar | 2026-09-09 | outbound | `reply` | email | **in** — valid as of §1 |
| `8cccac3a-394b-4191-bd32-c362424dcf21` | Tikka Tonic | 2026-09-03 | outbound | `first_contact` | email | outside |
| `0dc56f47-e1ed-4581-9461-8ca0906e5c25` | Tikka Tonic | 2026-09-03 | outbound | `first_contact` | email | outside |
| `f1213d14-0b15-4d93-ab1b-e4cc2a1bbfbd` | Tikka Tonic | 2026-09-03 | outbound | `follow_up` | whatsapp | outside |
| `b097cd09-04d4-4ae9-ab49-042744602b15` | Tikka Tonic | 2026-09-08 | outbound | `follow_up` | whatsapp | outside |
| `d05af53a-11de-49f6-be62-3e90cb97370c` | Pizza Mondo | 2026-09-08 | outbound | `first_contact` | email | outside |

**8 of 10 rows are outside the vocabulary** — `first_contact` ×6, `follow_up` ×2 — and they touch **all four**
prospects, not just Tikka Tonic and Azahar. Only two rows are already correct. No row anywhere stores
`3_chase_2` yet, and no row stores `chase`.

### 3.2 What was removed, and what I chose for the fallback

Removed from `lib/outreach.ts`: the `first_contact`, `follow_up` and `chase` entries in **`KIND_LABELS`**
(the display mapping) and in **`KIND_ORDER`** (the sort map). They were never in the picker — the picker maps
over `kindsForDirection`, which has only ever offered current values. `KIND_ORDER` now has exactly four keys
`["1_first_contact","2_chase_1","3_chase_2","reply"]`, and the removed values fall through to `99` — last,
and visibly not part of the sequence.

**The choice for an unrecognised stored value: humanise it.** *(As first built this was paired with an
amber ⚠ marker; the marker was removed at your request — see the addendum — because it fired on 8 of the
10 live rows, which is not a flag, it is wallpaper. The humanised label and the `title` remain.)* `kindLabel` no longer returns the
raw column value; it strips underscores and capitalises, so `follow_up` renders **"Follow up"**. The history
table then adds an amber **⚠** driven by `isKind`, with a `title` naming the stored value:
*Stored as "follow_up". Not one of First contact / Chase 1 / Final chase / Reply. Correct it by hand.*

The two halves are deliberately separate — `kindLabel` has no opinion about markers, the table has no opinion
about spelling — because the alternatives are each wrong in one direction: the raw value (`follow_up`,
underscore and all) is the unreadable row you rejected, and a humanised label with **no** marker would quietly
present "Follow up" as though it were a vocabulary item.

⚠️ **The one honest caveat.** `first_contact` humanises to **"First contact"** — the same words as the label
for the valid `1_first_contact`. Six live rows are in that state, and the ⚠ plus the tooltip are the only
things distinguishing them on screen. I judged that better than a suffix like "First contact (unrecognised)",
which is long enough to truncate in a 132px column and reintroduces the legacy-label look you asked me to
remove. If you would rather have the words, it is one line in `kindLabel`.

### 3.3 Proof — rendered by the shipped `HistoryTable`, over all 10 real rows plus 4 probes

```
   Outbound  First contact              ⚠      ← the 6 real `first_contact` rows
   Outbound  First contact              ⚠
   Outbound  Follow up                  ⚠      ← the 2 real `follow_up` rows
   Outbound  Follow up                  ⚠
   Outbound  First contact              ⚠
   Outbound  First contact              ⚠
   Outbound  First contact              ⚠
   Inbound   Reply                      ⚠      ← inbound + legacy: rendered as a reply, still flagged
   Outbound  Reply                             ← 🔴 THE UNGATING, VISIBLE: valid, no marker
   Outbound  Chase 1                           ← the one already-correct outbound rung
   Outbound  Banana                     ⚠      ← probe: a value that has never existed
   Outbound  —                          ⚠      ← probe: kind is NULL
   Inbound   Reply                             ← probe: correctly stored inbound reply
   Outbound  Reply                             ← probe: correctly stored outbound reply
```

No row renders blank, and no row renders raw (the check asserts on a literal underscore surviving into the
cell). The fallback was tested with values that are **not legacy at all** — a guard that only worked on the
five or eight known strings would fail here:

```
   stored "follow_up"        → "Follow up"        isKind false   ⚠ true
   stored "chase"            → "Chase"            isKind false   ⚠ true
   stored "banana"           → "Banana"           isKind false   ⚠ true
   stored "SOME_WEIRD_value" → "SOME WEIRD value" isKind false   ⚠ true
   stored "x"                → "X"                isKind false   ⚠ true
   stored "1_first_contact"  → "First contact"    isKind true    ⚠ false
   stored "reply"            → "Reply"            isKind true    ⚠ false
   stored ""  / null / undefined → "—"            isKind false   ⚠ true
```

The same treatment was extended to the contact popout's header (`OutreachPanel.tsx:1493`), which also renders
`kindLabel`; without it, opening a legacy row would have shown an unmarked "Follow up" one click away from a
marked one.

### 3.4 Does removing them before you fix the data break anything? **No.**

* **Nothing in the code names a removed value.** Grep over `app/`, `components/`, `lib/` for `'follow_up'`,
  `'first_contact'`, `'chase'`: the only hits are two prose comments in `lib/outreach.ts` describing the old
  vocabulary. No branch, no map key, no comparison.
* **No write path could ever produce one.** `isKind` rejected all three before this change and still does, so
  the API refuses them and the picker never offers them.
* **The double-log guard is unaffected.** It compares stored values through `contactSignature`, never labels,
  so the eight legacy rows still de-duplicate exactly as they did.
* **Sorting is unaffected.** History sorts by date; `kindOrder` is used only by the picker, which contains no
  legacy values.
* `npx tsc --noEmit` → **0 errors**.

The only consequence is the visible one: 8 of your 10 rows now carry a ⚠ until you correct them. **You do not
have to correct the data first** — but the marker is there precisely to tell you which rows to correct, and
the list is §3.1.

---

## 4. The unapplied migration — 🔴 **do not run `20260910_outreach_contact_kinds.sql` as it stands**

`supabase/migrations/20260910_outreach_contact_kinds.sql` — 3,882 bytes, 53 lines, **still not applied**, and
I have not modified it. It is now wrong in **four** ways, three of them new since the previous report.

1. **(Previously reported, still true.) It would re-mislabel the inbound Azahar row.**
   `update … set kind = '1_first_contact' where kind = 'first_contact'` carries no direction filter, so it
   moves `076f3cb2` — an inbound row — onto a rung of the outbound ladder. Under today's vocabulary an
   inbound row can only be `reply`.

2. **(New.) Its row counts are stale, and its own verification step would fire a false alarm.**
   The file states "9 rows total" and its verify block says *"Expected afterwards: 1_first_contact 6 ·
   2_chase_1 2 · reply 1 · TOTAL 9 … If TOTAL is not 9, something deleted rows"*. There are now **10** rows
   (`content-range 0-9/10`) — a `2_chase_1` row was logged on 10 Sep. A correct run would leave
   `1_first_contact` 6, `2_chase_1` **3**, `reply` 1, **total 10**, and the file would tell you to suspect
   deletion when nothing had been deleted.

3. **(New.) Its reasoning about `reply` is now false.** It argues at length that `reply` stays as "a legacy
   value the picker no longer offers and `kindLabel` renders as 'reply (legacy)'". As of §1, `reply` is in
   the vocabulary, is offered in both directions, and renders as "Reply". The *statements* are unaffected —
   no UPDATE touches `reply`, and leaving that row alone is now more right than it was — but the comment
   explaining why is no longer true.

4. **(Reported before, unchanged.) Both `follow_up` rows map to the same rung.** `f1213d14` (3 Sep) and
   `b097cd09` (8 Sep) would both become `2_chase_1`, leaving one rung climbed twice five days apart. The
   later one is really the second chase — `3_chase_2`.

**Do not run it.** The corrected statements, for whenever you want them (I have written nothing to disk and
applied nothing):

```sql
-- outbound legacy first contacts → the first rung  (expect 5)
update public.outreach_contacts set kind = '1_first_contact'
  where kind = 'first_contact' and direction = 'outbound';

-- the inbound row is a reply, not a rung  (expect 1)
update public.outreach_contacts set kind = 'reply'
  where kind = 'first_contact' and direction = 'inbound';

-- the two chases are two DIFFERENT rungs  (expect 1 each)
update public.outreach_contacts set kind = '2_chase_1' where id = 'f1213d14-0b15-4d93-ab1b-e4cc2a1bbfbd';
update public.outreach_contacts set kind = '3_chase_2' where id = 'b097cd09-04d4-4ae9-ab49-042744602b15';
-- `46c6c4eb` (outbound / reply) is already valid — leave it alone.
-- Expected afterwards: 1_first_contact 5 · 2_chase_1 2 · 3_chase_2 1 · reply 2 · TOTAL 10
```

Whatever you run, **finish with `notify pgrst, 'reload schema';`** — PostgREST caches the schema, and until it
reloads a table that exists still answers `PGRST205`, which reads as a failed migration.

One thing that has **not** changed: no schema migration is required for any of this. `kind` is
`text` with no CHECK and no enum (`20260903_outreach_tracking.sql:60`), so the vocabulary lives in
`lib/outreach.ts` and nowhere else. The two duplicate Tikka Tonic rows (`8cccac3a` / `0dc56f47`, 0.755s
apart) are a separate decision — one of them should be deleted, and nothing in the data says which.

---

## 5. Confirmation that no stored value moved

Every row captured **before** the first edit and re-fetched **after** the last one, diffed on every field —
id, direction, kind, channel, contacted_at:

```
before: content-range 0-9/10   fetched 10
after:  content-range 0-9/10   fetched 10
IDENTICAL — 10 rows, every field compared, nothing moved
```

This is the check that separates a label change from a data change: "Final chase" and "Follow up" both appear
on screen without a single stored byte differing.

---

## 6. What is proven how

**Compiler-confirmed** — `npx tsc --noEmit` → **0 errors** after every edit.

**Executed against the shipped code** (real `lib/outreach.ts` and the real `HistoryTable`, compiled from
source with the repo's own TypeScript and run — not re-implemented): `kindsForDirection` for both directions;
the picker's sorted, labelled contents; `defaultKindFor`; `kindOrder`; `followUpDateFor` for every rung and
for `reply`; `isKind`; every fallback probe in §3.3 including values that were never legacy; and the 14
rendered history rows.

**Re-derived from the live database** — all 10 `outreach_contacts` rows with ids, dates, directions, kinds
and channels, count-asserted against `content-range` on both the before and after reads; the 8-of-10 figure;
the per-prospect breakdown; the migration's expected-vs-actual totals.

**Structural (read, not executed)** — that no code outside comments names a removed legacy value (grep over
`app/`, `components/`, `lib/`); that the API reaches the vocabulary through its existing `isKind` import; that
the Direction/Kind JSX handlers call the functions proven above (the handlers are inline JSX and were not
themselves executed).

**Reasoned only** — that humanise-plus-marker beats a "(unrecognised)" suffix at this column width (§3.2);
that `b097cd09` is really the second chase rather than a repeat of the first; that of the two duplicate Tikka
Tonic rows, nothing in the data says which to delete.

**Not run** — `npm run build`. `npx eslint` reports the same **13 errors + 1 warning** as before this task
(lines 327, 385, 396, 403, 505, 544, 565, 1101, 1111, 1375, 1469, 1644, 1645) — all pre-existing
`set-state-in-effect` / `no-explicit-any` patterns, none on a line this task added; the 1644/1645 pair is the
1632/1633 pair from the previous task, shifted by the lines added here.


---

## 7. Addendum — two changes made after this report was first written

**(a) The ⚠ markers are gone.** Every marker driven by an unrecognised or direction-contradicting `kind`
was removed from the history row and from the contact popout — *"remove the exclamation marks where it was
showing legacy, it's completely unnecessary"*. The humanised label does the whole job, and the `title` still
names the exact stored string. Re-rendered from the shipped `HistoryTable` over all 10 live rows plus four
probes, no marker appears anywhere:

```
3 Sept 2026  | Outbound | First contact | Email    | View
3 Sept 2026  | Outbound | First contact | Email    | View
3 Sept 2026  | Outbound | Follow up     | WhatsApp | View
8 Sept 2026  | Outbound | Follow up     | WhatsApp | View
8 Sept 2026  | Outbound | First contact | Email    | View
8 Sept 2026  | Outbound | First contact | Email    | View
9 Sept 2026  | Outbound | First contact | Email    | View
9 Sept 2026  | Inbound  | Reply         | Email    | View
9 Sept 2026  | Outbound | Reply         | Email    | View
10 Sept 2026 | Outbound | Chase 1       | Email    | View
11 Sept 2026 | Outbound | Banana        | Email    | View     ← probe: value that never existed
12 Sept 2026 | Outbound | —             | Email    | View     ← probe: kind is NULL
13 Sept 2026 | Inbound  | Reply         | Email    | View
14 Sept 2026 | Outbound | Reply         | Email    | View
```

Still readable, still never blank, still never raw. The only ⚠ left in `OutreachPanel.tsx` is the unrelated
broken-image badge in the media cell (`:1134`), which is out of scope and untouched.

**(b) The fourth rung** — see §2, which was rewritten rather than left standing as a false record.

**(c) Date and Direction were crowded, and the cause was measurable.** At the shipped 76px, the Date
column's inner width was **64px** while `10 Sept 2026` renders **78.3px** — so a two-digit day overran its
own column and its text ended **2.3px past the start of the Direction text** (a negative gap; that is the
overlap in the screenshot). Single-digit dates hid it: `3 Sept 2026` is 70.7px and left 5.3px.

Fixed by measurement, not by eye: Date **76 → 104**, Direction **78 → 86**, and the table's cell padding
`px-1.5 → px-2` (6 sites, inside `HistoryTable` only). Re-measured at 1440px over the 10 live rows plus two
worst-case probes (`28 Dec 2026 / Final chase / WhatsApp`, `30 Sept 2026 / Inbound / In person`):

| gap between adjacent columns' TEXT | before | after |
|---|---|---|
| Date → Direction (worst row) | **−2.3px** | **+25.7px** |
| Direction → Stage (worst row) | 19.1px | 27.1px |
| Stage → Channel (worst row) | 57.2px | 57.2px |

Channel absorbs the difference (157.4px → 121.4px). Nothing else moved: table 489.4px inside a 491.4px
container, **no horizontal overflow**, **no clipped cell** (`scrollWidth > clientWidth` on every cell and
header: none), row height still 25px — one line per contact — and all five columns still hold one identical
x-position down every row.

Both changes are compiler-confirmed (`npx tsc --noEmit` → 0 errors), and the label/interval/order values
above were executed against the shipped `lib/outreach.ts`, not read off the source. Nothing was written to
the database in this session: `kind` values on all 10 rows are unchanged (§5).
