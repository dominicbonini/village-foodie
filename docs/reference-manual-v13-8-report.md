# Applying the V13.8 delta to the reference manual

**Branch:** `schedule-graphics` (`git branch --show-current` → `schedule-graphics`)
**Commit:** `fd092a1` — full hash `fd092a192b590f946a2b412fcf031f26061556ee`, pushed
**Date:** 3 October 2026
**Source:** `~/Downloads/reference-manual-v13.8-delta.md` (585 lines)
**Target:** `docs/reference-manual.md` — 26,653 lines before, **27,228 after** (+575)
**`main`:** untouched. Still at `deec9f5`. Nothing pushed to, merged into or rebased onto it.

**Nothing in the prompt or the delta arrived garbled.** One internal label slip is recorded in §4;
it is a cross-reference typo with a single possible reading, not a contradiction, and §4 sets out why.

---

## 1 · What was applied, in the delta's own order

| Step | Done |
|---|---|
| 1 · Bump the version in both places | Line 1 → `HatchGrab Engineering Reference Manual · V13.8`; front matter → `**Version 13.8**` |
| 2 · Part A under `# Changelog`, above `## V13.7` | Inserted at line 29; V13.7 now begins at line 171 |
| 3 · Part B (§63–§68) after §62, before the closing line | §63 at 26852 … §68 at 27168; `*End of manual.*` last |
| 4 · Part C in place to §60 and §62 | §60.7 (after §60.6, before §61); §62.9 and §62.10 (after §62.8, before §63) |
| 5 · Change nothing else; do not reflow | Held — see §6 |

**The post-bump grep the delta asks for** (`grep -nE "V13\.7|Version 13\.7"`) returns only:
historical changelog headings and `# 60/61/62` section titles; `**V13.7.**` and `SUPERSEDED V13.7` /
`CORRECTED V13.7` annotations inside older sections; and three *new* references in the V13.8 block that
cite V13.7 deliberately (the stale-stage note, the stale-stage open item, and "From V13.7, still open").
No stray version marker survives.

**Subsection numbers were checked before writing**, because the delta assumes they are free: §60 ended at
**60.6** and §62 at **62.8**, so 60.7, 62.9 and 62.10 are the next numbers in sequence. Had either been
taken, applying the delta as written would have produced two subsections with one number.

---

## 2 · Verification 1 — every commit hash, against `git log`

Checked against `git log --oneline main` and `git log --oneline schedule-graphics` on 3 October 2026.
**Seven corrections.** No hash was guessed, and none was left as `[hash not found]` — every one resolved.

| Delta said | Reality | Correction |
|---|---|---|
| Recorded steps → `11229e3` *(marked "verify")* | `11229e3` (1 Oct) is **"The values box stops being drawn across the message"** — a Templates layout commit, touching `TemplatesPanel.tsx` and two templates harnesses. It has nothing to do with recorded steps | **→ `6447120`** "outreach fixes" (1 Oct), which contains `lib/outreach-timeline.ts`, `ProspectTimeline.tsx`, `mail-send/route.ts` **and** `docs/outreach-recorded-steps-report.md`. One commit, code + report |
| Send must not fail → `29e1b74` / `6d951a5`, dated **1 Oct** | Both hashes correct. Both are dated **2026-10-02** | **Date → 2 Oct.** The changelog's status line now reads "the outreach fixes of **1–2 October**" |
| Stale stages → 1 Oct, "(SQL; `created_at` = first inbound)" | Wrong on every count — see §3 | Removed from the build table; carried as an **open item** with the real facts |
| Add event with places → `17b4ad1` / `cf44818` | `17b4ad1` is the code ✓. The **report** is `78db793` ("Record the add-event rebuild…"); `cf44818` is a later one-line fix to that report ("Correct the broken-variant count in the report: 33, not 28") | **→ `17b4ad1` / `78db793` (+ `cf44818`, a correction to that report)** |
| Per-van → `415210a` | Code ✓, but the report commit was missing | **→ `415210a` / `3a96448`** |
| Weekly post → `497ec99` | Code ✓, but the report commit was missing | **→ `497ec99` / `1510aa9`** |
| *(no row)* | `5160abf` "Add event preview: hand the card a date it can actually format" (3 Oct) is the **newest commit on the branch** — and the one the delta's own "84 run · 84 passed at the latest `schedule-graphics` commit" refers to | **Row added**, and the status line now names `5160abf` so the sweep figure is attributable |

**Correct as given, confirmed:** `d9e3484` / `a7391d8` and revert `deec9f5` (all three on `main`);
`cebc78e`; `1f98f22` / `d94479a`; `8cab840` / `197cb8c`; `d058162` / `719ac91`.

The delta's table header said "Where two are shown they are code / report"; two builds (`6447120`,
`ea0bf9c`) are single commits carrying both, so the header now says so explicitly.

### Also verified while checking hashes

| Claim | Result |
|---|---|
| All four migration files exist | ✅ `20261003`, `20261004`, `20261005`, `20261006` all present |
| "`main` no longer contains `20261003_truck_places.sql`" | ✅ — and **stronger than stated**: `main` contains **none** of the four, while `schedule-graphics` contains all four. Wording widened |
| "`page.tsx` ~14,900 lines" | ✅ **14,912**. Changed to the exact figure |
| The §65.4 `:has()` rule | ✅ byte-for-byte what is in `app/globals.css` |
| Supabase project `ffphgwonshgxamtvefcv` | ✅ confirmed from `.env.local` by reading the **host only** — no key was printed or read |
| "84 run · 84 passed" | ✅ matches the sweep run at `5160abf` |

---

## 3 · Verification 2 — the `[FROM SUMMARY]` items

The delta flagged three blocks as recorded from the planning chat rather than from the reports, and asked
for them to be checked against `docs/outreach-recorded-steps-report.md` and
`docs/outreach-send-read-failure-report.md`. Both reports exist.

### §60.7 — send must not fail (verified clean, no correction)

Every claim appears in `docs/outreach-send-read-failure-report.md`: 3Bros Burgers · the `preview`
column · the `sent_copy` misuse · `42703` · `guardHistoryUnreadable` · `outreach_messages.guard_override`
· test sends bypassing guards · `scripts/outreach-schema-census.cjs`. The text was applied unchanged
except for the date (1 Oct → **2 Oct**, §2) and one addition:

> ⚠️ The `guard_override` column's migration was written and published a day earlier, in the
> recorded-steps report, where it is marked "not applied — nothing above waits on it". It ships in this
> build's commit, `29e1b74`.

That is worth saying because the migration file is dated `20261001` while the build that uses it is from
the 2nd, which otherwise looks like an inconsistency.

### §62.9 — recorded steps (two corrections)

| Claim | Checked | Outcome |
|---|---|---|
| `recordedStepsFor` is the one rule | In the report (and in `lib/outreach-timeline.ts:311`) | ✅ kept |
| `contact_id` set, or paired via `pairHandLoggedEmails` | In the report (and at `lib/outreach-timeline.ts:196`) | ✅ kept |
| "Record as ▾" offers the four steps | In the report | ✅ kept |
| "**a reply is not a rung**" | The report words it differently — "replies sit outside the ladder on purpose, so an email logged as a reply has had **no rung** recorded for it" | ✅ substance verified; kept, and the report's fuller wording folded in, together with its "`contact_id` set but the contact row unread ⇒ not named" rule |
| "A reply logs its kind through **`loggedKindFor`**" | **Not in the report at all.** `loggedKindFor` exists, but in `lib/outreach-sequence.ts`, introduced by **`e796e07` (30 September)** — a different build — and it is **already documented in the manual at §62.3, "The logged kind is the step, decided on the server"** | 🔴 **Removed from §62.9.** Attributing it here would have claimed a 30 September function as 1 October work and duplicated §62.3. Replaced with a cross-reference distinguishing the two: §62.3 decides the kind of a send *being made*; §62.9 decides whether an email *already sent* counts as a step |
| "Stale stages … corrected by hand with SQL (stage set from the first inbound message)" | See below | 🔴 **Removed from §62.9**; replaced with the report's own statement that this build ran **no SQL** |

### The stale-stage SQL — wrong on every count

The delta carried this as a 1 October V13.8 build. The repository says otherwise:

1. **Neither named report contains any stage-correcting SQL.** The recorded-steps report states in its
   opening that its build involved "no `outreach_templates` change, no email sent, **no SQL run**, no row
   written".
2. **The only such SQL in the repository** is in `docs/outreach-crm-polish-report.md` §8, committed in
   **`35b791d`, 30 September** — inside V13.7's range, not V13.8's.
3. **It does not touch `created_at`.** It sets `stage = 'replied'` for prospects in `not_contacted` or
   `contacted` that have an inbound message, and writes a `stage_change` event for each.
4. **V13.7's own open items already record it**, as: *"Prospects with inbound replies from before the
   single stage writer existed still read `contacted` (e.g. Nomadough). Cursor produced a read-only list
   query and an UPDATE (polish report §8). **Not reviewed, not run.**"*

So the question the delta answers "done, 1 Oct" is one the repository answers "written on 30 Sep, not
run as of V13.7". **Whether it has been run since cannot be established from the repository** — running
SQL leaves no trace in git, and no report records a run.

It is therefore **not** in the V13.8 build table. The changelog carries a ⚠️ note setting out all four
points, and the open-items table carries it forward as unresolved, needing confirmation by hand. This is
the "do not guess" rule applied to a fact about the database rather than to a hash.

---

## 4 · Verification 3 — conditional lines

**`docs/outreach-template-conditions-report.md` exists** (28,495 bytes, 1 October). The delta's
conditional branch therefore applies: the paragraph is replaced by a summary of what was built, with its
commit.

**Commit:** `ea0bf9c` "outreach" (1 Oct) — `lib/outreach-template-render.ts`,
`components/admin/TemplatesPanel.tsx`, two templates harnesses, **and** the report. One commit, code +
report. Added to the build table as its own row, which the delta did not have.

**§62.10 as written** summarises: the red "half of a conditional pair" warning rested on a premise that
was wrong in the common case (a one-sided condition is the ordinary correct use), so the editor accused
the operator of a mistake on every view of a correct template — which mattered because the next red thing
on that screen is a malformed `{{truck name}}` for a real business. It is now a grey note naming the line
by its opening words and saying who reads it and how many ("12 of the 105 trucks… the other 93 won't see
this line"); a **pair** gets **one** note; an **unknown** condition gets none and still goes to red. Two
things descending from the same premise were fixed with it — the Insert condition menu offered pairs only,
so seven of nine conditions were missing from it, and `condPairs` was a second untestable copy of "which
conditions have a negative half". `conditionMet` is byte-for-byte unchanged. No SQL, no template row
touched, no email sent.

### Two things about §62.8 worth recording

**(a) The delta's label slip — flagged, not stopped for.** Its "Verify before you write" section says to
put the summary "under Part C's **§62.8** addition", while Part C itself numbers that addition **§62.10**.
There is exactly one conditional-lines addition in Part C, both sentences instruct the same action on it,
and §62.8 is already occupied by an existing section — so the number in the verify bullet is a
cross-reference typo with a single possible reading, and both readings produce identical content in an
identical place. That is not two instructions pulling in different directions, so it did not meet the bar
to stop and ask; it is recorded here instead.

**(b) §62.8's last bullet is now superseded, and was deliberately left standing.** It reads: *"A build to
make it a grey note naming the trucks that will not see the line is **written, not built** (open
items)."* That was true on the day it was written and is false now. The delta's step 4 says **"Add; do not
delete — this manual records what was believed and when"**, so it stays. §62.10 opens by saying in terms
that it supersedes it, so a reader meeting §62.8 first is not left with the stale belief.

---

## 5 · Corrections made to the delta's text — the full list

| # | Where | Correction |
|---|---|---|
| 1 | Part A build table | Recorded steps: `11229e3` → **`6447120`** (code + report); `11229e3` is the Templates values-box commit |
| 2 | Part A status line + build table | Send-read-failure dated **2 Oct**, not 1; status line now "the outreach fixes of **1–2 October**" |
| 3 | Part A build table | Stale-stage row **removed**; replaced by a ⚠️ note with the real commit (`35b791d`), real date (30 Sep), real effect (`stage = 'replied'`) and V13.7's "not reviewed, not run" |
| 4 | Part A build table | Add event report: `cf44818` → **`78db793`**, with `cf44818` named as a later correction to that report |
| 5 | Part A build table | Per-van: report commit **`3a96448`** added |
| 6 | Part A build table | Weekly post: report commit **`1510aa9`** added |
| 7 | Part A build table | **New row** for `5160abf` (add-event preview date format), the branch's newest commit |
| 8 | Part A build table | **New row** for `ea0bf9c` (conditional lines), which the delta had no row for |
| 9 | Part A status line | Names `5160abf` as the commit the 84/84 sweep was run at |
| 10 | Part A table header | "Where one is shown, that commit carries both" — two builds are single commits |
| 11 | Part A migrations note | Widened: `main` contains **none** of the four migrations, not just the first |
| 12 | Part A open items | `page.tsx` "~14,900" → **14,912** |
| 13 | Part A open items | **New row** for stale stages, carried forward from V13.7 as unresolved |
| 14 | Part A failure class 8 | Added the finding that the "+24 hours per day" DST bug **cannot** occur for a UK Monday-start week — a variant that could not be made to fail, which is itself the result |
| 15 | Part C §60.7 | Date 1 Oct → **2 Oct**; added the note about the `20261001` migration shipping in a 2 Oct commit |
| 16 | Part C §62.9 | **`loggedKindFor` removed** — it is `e796e07` (30 Sep) and already documented at §62.3; replaced with a cross-reference distinguishing the two |
| 17 | Part C §62.9 | Stale-stage sentence **removed**; replaced with the report's "this build ran no SQL" |
| 18 | Part C §62.9 | "a reply is not a rung" kept, with the report's fuller wording and its "`contact_id` set but contact unread ⇒ not named" rule folded in |
| 19 | Part C §62.10 | Rewritten from "build not confirmed" to a summary of what was built, with commit `ea0bf9c`, and an explicit statement that it supersedes §62.8's last bullet |
| 20 | Part B §64.7 | Added the preview's date format (`DD/MM/YYYY`, what `TruckListCard` parses) — built after the delta was written (`5160abf`) |
| 21 | Part B §67.1 | Added that the `schedule_graphics` gate is enforced **server-side as well**, in `app/api/weekly-post/route.ts` |
| 22 | Part B §67.4 | Added the DST finding from failure class 8 |

Items 14, 20 and 21 are additions rather than corrections of error: they are facts the planning chat
could not have had, because the work landed after the delta was written. They are listed here so the
distinction is on the record.

---

## 6 · What was deliberately **not** changed

- **"September 2026" in the front matter** (line 10, under `**Version 13.8**`). V13.8 is October work, so
  this now looks stale — but the delta names exactly two places to bump and then says *"Do not change
  anything else."* Changing a third would be choosing where its instruction stops. **Flagged for your
  decision**; it is a one-line edit whenever you want it.
- **§62.8's superseded bullet** — see §4(b).
- **Everything else.** The diff against the pre-edit copy shows **exactly two modified lines** (the two
  version markers) and no deletions anywhere; the remaining 575 lines are additions. Nothing was
  reflowed.

---

## 7 · Checks on the finished file

| Check | Result |
|---|---|
| Lines before → after | 26,653 → **27,228** (+575) |
| Lines deleted or altered | **2** — the two version markers, and nothing else |
| Fenced code blocks balanced | ✅ 60 fences (even) |
| Section order | §60 (→60.7) · §61 · §62 (→62.8, 62.9, 62.10) · §63 · §64 · §65 · §66 · §67 · §68 · `*End of manual.*` |
| Subsection numbering | 60.7, 62.9, 62.10 were all free before writing |
| Closing line still last | ✅ |
| `V13.7` grep | Only historical headings, section titles, `SUPERSEDED/CORRECTED` annotations, and three deliberate V13.8→V13.7 cross-references |
| `main` | Untouched at `deec9f5`; nothing pushed to, merged into or rebased onto it |
| Branch | Committed and pushed to `schedule-graphics` only |

---

## 8 · Noticed, not changed

1. **The front-matter month** — §6.
2. **The delta's §62.8/§62.10 label slip** — §4(a). Worth fixing in whatever produces these deltas, since
   a reader following the verify bullet alone would look for an addition under a section that already
   exists.
3. **`11229e3` being quoted for recorded steps** suggests the planning chat was reading a commit list in
   which the Templates and outreach work of 1 October sit adjacent. Three of the seven hash corrections
   were of that shape — a neighbouring commit rather than a wrong-looking one — which is the argument for
   the delta's own "verify every hash" rule.
4. **Two 1 October commits are named "outreach fixes" and "outreach"**, and each contains a feature, its
   report, and unrelated scraper work. That is why neither could be identified from `git log --oneline`
   alone; both had to be opened. Nothing to fix retrospectively, but single-purpose commits would have
   made this verification a minute's work rather than twenty.
5. **The stale-stage SQL remains genuinely unresolved** and now has a line in V13.8's open items as well
   as V13.7's. It is the only item in this delta whose true state the repository cannot settle.
