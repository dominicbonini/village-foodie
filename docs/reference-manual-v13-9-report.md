# Applying the V13.9 delta — four hash corrections and a misfiled section

**Branch:** `schedule-graphics` (confirmed with `git branch --show-current` before the commit).
`main` and `event-types` untouched. **Nothing deployed. No SQL run.** No keys printed.

**Nothing in the prompt or the delta arrived garbled**, and no instruction contradicted another, so I
did not stop. One instruction in the delta pointed at the wrong section and four hashes were wrong —
those are corrections the delta's own "Verify before you write" section asks for, not contradictions.

⚠️ **I did not push.** The delta says pushing `schedule-graphics` is fine; your prompt asked for the
work on that branch, not for a push. Permission is not an instruction, so the commit is local.

---

## 1 · WHAT WAS APPLIED

| Step | Done |
|---|---|
| 1 · Version bumped in both places | line 1 → `· V13.9`; front matter → `**Version 13.9**`. The month under it stayed `October 2026`. |
| 2 · Part A inserted | directly under `# Changelog`, above `## V13.8 — …` |
| 3 · Part B appended | §69–§72 after §68, before `*End of manual. …*` |
| 4 · Part C applied | seven additions, each verified to be inside the section it names (one re-filed — §3.5) |
| 5 · Nothing else changed | +305 / −2 lines; the two deletions are the version strings |

**The delta's own grep check passes.** `grep -nE "V13\.8|Version 13\.8"` now returns only the historical
changelog heading, two section titles (§60.7, §62.9) and four deliberate cross-references inside the new
V13.9 block. No live version string says 13.8.

---

## 2 · 🔴 EVERY CORRECTION I MADE

The delta said its planning chat "worked from Cursor's chat summaries and reports, not from git", and
asked for each item to be checked and corrected. Five corrections, all listed.

### 2.1 Four wrong or missing commit hashes

Checked with `git log --oneline schedule-graphics` and `git log --oneline event-types`, and each
candidate confirmed with `git show --stat` so that "code" and "report" are not guesses.

| Row | Delta said | Repository says | Correction |
|---|---|---|---|
| Single-event post, stage 2 | `8b3112c` **[verify]**, one commit carrying code *and* report | `8b3112c` is **code only** (18 files, incl. `20261007_event_post_backgrounds.sql`). The report is a separate commit: `540ab39` — *"Record the single-event post…"*, one file, `docs/event-post-stage2-report.md` | split into **code `8b3112c`** / **report `540ab39`** |
| A design per place; …; manual month fixed | `66fec25` **[verify]** | 🔴 **Wrong commit.** `66fec25` is a small follow-up — two files, the *"Add a picture"* empty state plus a 32-line amendment to the report. The build is **`49da39a`** (15 files: the route, `EventPost.tsx`, `SchedulePlaces.tsx`, `lib/weekly-post/*`, `20261008_event_post_place_layouts.sql`), and it also carries **its report** and **the manual month fix** (`docs/reference-manual.md`, `September 2026` → `October 2026`) | **`49da39a`**, with `66fec25` added as its own row, named as the follow-up |
| V13.8 manual applied | `fd092a1` (no marker) | `fd092a1` is the manual itself. Its report is **`f8b9c56`** — *"Record applying the V13.8 delta: seven hash corrections…"* | split into **`fd092a1`** / **`f8b9c56`** |
| Event types investigation | **[hash not given — verify]** | **`ba6c9b3`** — *"Investigate event types…"*, one file, 920 lines, report only | filled in as **`ba6c9b3`** (code column `—`, because there is none) |

**Confirmed correct, `[verify]` markers removed:** `9d3ecb8`, `88b71f1`, `5cde26d` (event-types);
`8f50c49`, `726ca02` (schedule-graphics). Each matches its subject line exactly.

The table's header sentence was rewritten accordingly: it said *"Where one hash is shown, that commit
carries both the code and its report"*, which was true of only four of the nine rows.

### 2.2 🔴 A Part C addition filed under the wrong section

The delta's fourth instruction says *"§65.3 — add at the end"* for a note reading:

> The sticky jump tabs are now **pills** (§71.3), **superseding "not pills" above**.

Both halves are wrong about the manual:

- **§65.3 is "Settings — one scrolling list with sticky jump tabs"**, and it describes *behaviour* — the
  flush bar, `<main>` as the only scroller, the measured pin line, `bar.scrollLeft`, the deep links. It
  does not mention the bar's **look** at all; the word "pill" does not appear in it.
- **The phrase "not pills" appears nowhere in the manual.** What §71.3 actually supersedes is in
  **§65.2 "One sub-tab bar style"**: *"One **underlined** bar style is shared by Menu, Schedule and
  Settings (`SUBTAB_BAR`, `SUBTAB_ROW`, `subtabBtn()`)…"*

Left as written, the correction would have been added to a section it does not contradict, while the
sentence it *does* contradict stayed unqualified — the opposite of what the delta's "add; do not
delete" rule is for.

**So I split it.** The pills note went to the **end of §65.2**, naming the real superseded phrase; the
Schedule-settings note — which *is* about the Settings Schedule section, and so does belong in §65.3 —
stayed at **§65.3**. Both are V13.9-labelled block quotes, and nothing was deleted.

### 2.3 A stale list in §65.2, corrected in the same addition

§65.2 lists **"Menu: Items (default) · Extras & upsells · Deals"** and `?section=` as
`items|extras|deals`. On this branch `MENU_SECTIONS` is now **Items · Kitchen capacity · Extras &
upsells · Deals** (`page.tsx:219`, with Kitchen capacity second by your 4 October decision), so
`?section=` also takes `capacity`. The §65.2 addition records both. Schedule's list is unchanged
(`events|weekly`) — `SCHEDULE_SECTIONS` still has two entries, and the comment at `page.tsx:249` records
that `places` was deliberately removed.

### 2.4 A production figure marked as such

Part A's migration table asserted *"checked: 14 vans, 14 equal, 0 differ"* for
`20261010_capacity_same_as_first_van.sql`. That number is **not recorded anywhere in the repository** —
it is the result of a verification select you ran against production. Nothing contradicts it, so the
figure is kept, attributed: *"Dominic's verification select read 14 vans, 14 equal, 0 differ (a
production result; not recorded in the repository)."*

---

## 3 · WHAT I CHECKED AND FOUND CORRECT

### 3.1 §70, against the four `event-types` reports

Read with `git show event-types:docs/<name>.md`, as instructed — they are not on this branch.

| Claim | Source |
|---|---|
| modal columns **label 212px, values 168px**, dialog capped at `min(1000px, 100%)` | `event-types-v3-report.md:88` |
| labels are **`Order-ready step`** from `SETTING_COPY.orderReady.label`, not "Mark ready" | same, §1 — the brief's contradiction you resolved |
| **exactly one row is truck-level** — `Do you take cash?` = `trucks.takes_cash`, written by `update_truck`; one switch per van column, titled **"Applies to all your vans"** | same, §2 and §3 |
| inheriting cells show the first van's value with **"Follows each van's usual setting"** on hover | same |
| `order_ready_source` is `'seed' \| 'truck' \| NULL` | the CHECK constraint in `20261009_event_types.sql` |
| `event_type_id` is `on delete set null`, "NEVER cascade" | same migration, with its own comment |
| event types are **Max/trial only** | `event_types` in `MAX_FEATURES`, `lib/features.ts:83` |
| the modal opens from an **"Event types" button in the Schedule header** | `<Btn label="Event types" …>` on `event-types`, whose comment says a button "works either way" and that promoting it to a third pill after the merge is one entry |
| the card is at the top of the dashboard's **Kitchen** tab | `event-types-stage2b-report.md` §4.5 — "the dashboard's Settings (\"Kitchen\") tab" |

### 3.2 §69 and §71, against the `schedule-graphics` reports and the code

Every identifier §69 names exists in both a report and the source: `resolveDesign` (`backgrounds.ts`),
`validateEventLayout` / `toggleIsAllowed` / `LAST_TOGGLE_MESSAGE` / `bgDayOff` (`layout.ts`),
`poweredByEl` (`render.ts`), `EVENT_MODAL_SHELL` (`page.tsx`), `sg_merge_place` (`SchedulePlaces.tsx`),
"Different shape" (the route), "within 1%" (`backgrounds.ts`). `renderEventPost` exists at
`render.ts:389` and is called from `/api/weekly-post`; there is exactly **one** `new ImageResponse`, in
`render.ts`, and `paint()` is at `render.ts:324` — so §69.1's "the only `ImageResponse` call" holds.
`entryFor` returning `placeId` is recorded at `event-post-per-place-report.md:180`.

§71's claims match `manage-moves-2-report.md`, including the 32px pill and that you chose it over the
brief's 40px.

### 3.3 The four pieces of removed copy

Part A's decisions row matches `manage-moves-2-report.md` §5 **word for word**, including the
parenthetical that the amber notice's behaviour is unchanged.

### 3.4 The migration table's branch column

All five checked with `git show <branch>:supabase/migrations/<file>`:

| Migration | On `schedule-graphics` | On `event-types` | Delta says |
|---|---|---|---|
| `20261007_event_post_backgrounds.sql` | ✅ | — | schedule-graphics ✅ |
| `20261008_event_post_place_layouts.sql` | ✅ | — | schedule-graphics ✅ |
| `20261009_event_types.sql` | — | ✅ | event-types ✅ |
| `20261010_event_types_offline.sql` | — | ✅ | event-types ✅ |
| `20261010_capacity_same_as_first_van.sql` | ✅ | — | schedule-graphics ✅ |

`capacity_same_as_first_van` is `set default false` then `set not null`, as the table says.

### 3.5 Every Part C anchor

All seven exist and each addition is inside the section it names — verified after writing by walking
back from each inserted line to its nearest heading. §68.2 does name `event_price_overrides` and the
"preset that fills the existing per-event tables" architecture, so that addition's correction is
pointed at something real.

---

## 4 · ⚠️ ONE THING I COULD NOT VERIFY, LEFT AS WRITTEN

Part A's decisions table and §71.2 both say the Schedule-settings move was **"reversed by Dominic the
same day: it goes back into Settings"**. That decision is **not recorded in any report in the
repository**, and nothing in the repo contradicts it — it is a planning-chat decision, like the others
in that table. It is kept as written.

For the avoidance of doubt about the code: the modal **is** built and committed on this branch
(`726ca02`), and §71.2 says so before recording the reversal as not-yet-built. The manual is therefore
accurate about both the code and the decision.

---

## 5 · THE RESULT

- `docs/reference-manual.md`: **27,531 lines**, +305 / −2.
- Version **V13.9** in both places; `October 2026` unchanged.
- Changelog: **§V13.9** above §V13.8.
- New sections **§69 · §70 · §71 · §72**, between §68 and the closing line.
- Seven V13.9 additions in place: §63.2, **§65.2**, §65.3, §66.4, §68.1, §68.2, §68.3.
