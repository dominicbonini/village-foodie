# Reference manual update — V16.0 → V16.1

19 October 2026. I merged `~/Downloads/reference-manual-delta-us-rehearsal-legal.md` into `docs/reference-manual.md`,
following the delta's own header:
- each block is placed by heading text, and a new section is created at the end where none exists;
- the delta is reconciled with the manual, with no duplicates;
- where the delta contradicts the manual, it wins and the old line is corrected in place;
- the version moves to the next minor (V16.1), with the delta's changelog entry.

Nothing else in the manual was changed. No other file was touched, apart from this report. Nothing was committed or
pushed, and no SQL was run.

**Result.**
- **Version:** the manual is V16.1. The running header (line 1) and the front-matter `**Version 16.1**` agree; I
  grepped both.
- **Diff:** 423 lines added and 57 removed. I read every removed line. Each one is an in-place correction (the old text
  is mostly kept struck through) or the version bump.
- **Garbling or contradictions:** none. The prompt and the delta read cleanly, and nothing in them contradicted
  anything else.

## Where each block went

| Delta block | Placed in | Why there |
|---|---|---|
| Proposed changelog entry | New **V16.1** entry at the top of the Changelog, above V16.0 | Same format as V16.0: summary, placement table, corrected lines, and the delta checked against the manual |
| US readiness — layout (UPDATE) | **§76.8** | The 22 issues, the six fix directions and five of the six GB problems are marked fixed in place. "How it was done", "Decisions (18 Oct)" and "What changed" (including the pending-card buttons) are added at its end |
| US readiness — the hidden US test truck (NEW) | **§76.9** (new) | Next to §76.8; the US readiness subsections live in §76 |
| Security (UPDATE) | **New §80 "Security"**, at the end | No section is titled Security, so the header's rule applies. Almost all of the block was already in §35, "A FUNCTION'S DEFAULT GRANT IS PUBLIC" (added 19 Oct), or in the secrets standing rule, so those lines were corrected there. §80 holds the one new rule (no browser `.rpc()` calls) and points to the rest |
| Marketing site and SEO (ADD) | **§48** "The landing page and marketing surfaces", new subsection at its end | No section has that exact title; §48 is the marketing site's section, and its Open list held the truck-metadata item this resolves |
| Money formatting (ADD) | **§76.2** "Client-safe formatting" | The delta says to place it with the money-format notes, and §76.2 holds the `lib/money-format.ts` note |
| Languages (ADD) | **§77.11** (new) | §77 is Languages |
| Legal (NEW or UPDATE) | **§43** "Legal, email and domain", new subsection at its end | An update of the existing legal section |
| Tooling and workflow (ADD) | **§79**, at its end | |
| Deploy posture (REPLACE the current block) | **§49**: a new current block for V16.1 | §49's heading says earlier postures stay below, each dated. So the V16.0 block is no longer current and stays as history. Its stale lines are corrected |
| Open backlog (UPDATE) | **§27**: a new V16.1 block, with the V15.8 and V16.0 blocks corrected in place | Same pattern as V16.0 |
| Cross-cutting engineering invariants (ADD) | **§35.ai** (new, after 35.ah) | |

## Older lines corrected in place

- **The secrets standing rule** (top of the manual):
  - "report set or missing", "check with a parser that emits nothing" and "check one name at a time with
    `grep -q`" are struck;
  - the 18 October incident is its third precedent;
  - the rule now reads as decided on 18 Oct: no agent opens, parses, lists, loads or tests any `.env*` file in any
    form; configuration is worked out from code.
- **§35, function grants:**
  - "Verified false / false / true" now says it was undone, re-applied on 19 Oct, and is guarded;
  - "OPEN on 19 October" (the eight functions) becomes "CLOSED", with the 0-rows verify;
  - the migration record now says "do not run" and names 15 creating migrations;
  - the guard's allow-list is recorded as empty.
- **§43:** the V11.45 PostHog block ("OPEN — nothing has been changed") is marked resolved. So are item 1 of the
  V11.54 three-defects list and the analytics half of item 2.
- **§47:** "persistence defaults to cookie plus local storage" is corrected to `persistence: 'memory'`, with the note
  that visitor counts read higher.
- **§48:**
  - the V12.6 "privacy policy is still contradicted" line is resolved;
  - two Open items are fixed: the back-to-back tinted bands, and the truck-page metadata.
- **§52 and §60:** "nothing is appended" now names the company line; §60's refusals gain the opt-out refusal and its two
  exemptions.
- **§53.8 item 8:** the opt-out line is enforced again; the signature is still the operator's.
- **§27:**
  - four "analytics cookie" open lines are closed;
  - V15.8 block: the revokes migration and the date mismatch are done; "legal text per country, with a lawyer" is done
    as best effort, with no lawyers decided on 18 Oct; US plan prices now include the unlimited plan;
  - V16.0 block: the US layout fixes, screens still showing `error`, truck-page metadata and thousands separators are
    done.
- **§49:** the V16.0 and V15.9 postures note that the overnight work and `auto-event-scheduler` were deployed on 19 Oct.

## Not repeated, because the manual already said it

- **Most of the delta's Security block:** the cause, the ACL order, the 24-hour logs, the migration file, the guard,
  "⛔ DO NOT RUN", and undo SQL kept out of chat. All of it was in §35 from 19 Oct.
- **The localhost note** ("marketing pages need `hatchgrab.localhost:3000`") is already in §48; §79 points to it.
- **"The SQL editor shows only the last statement's result"** is already recorded at V13.7. It is listed in §79 with
  that reference.
- **The first two of the delta's six invariants** (revoke in the same file; never print rollback SQL) are in §35's
  function-grant class. 35.ai points to them, as 35.ag already does.

## Judgment calls, stated

1. **Security got a new §80**, as the header asks when no section of that title exists. To avoid duplicates it is
   short: one new rule, and pointers to §35, the standing rules and §27.
2. **"Marketing site and SEO" went into §48,** not a new section, because §48 is the marketing site's section. This
   follows the V16.0 merge, which placed "US readiness" under §76 for the same reason.
3. **"REPLACE the current block" in §49** made the V16.1 block the current one and kept V16.0 as dated history, as the
   section's own heading requires.
4. **Backlog "Close: the state on emailed schedules"** had no backlog line to close; the fact is in §76.9.
5. **The "Truck not found" fix** applies to trucks with no discovery row. The older §27 and §32 entries are about a
   graduated truck's `excluded` shadow row, a different case, so they were left alone.
6. **§76.8's last GB problem** ("the ticket's printed stamp shows only the time") stays open, because the delta does
   not mention it.
7. **Older changelog entries are history** and were not edited, including V11.45's PostHog line.
8. **The twin truck's dashboard and KDS tokens** appear nowhere in the manual, as the delta instructs.

## Checks run

- `grep -nE "V16\.1|Version 16\."`: the header and the front matter both read 16.1.
- No placeholder text is left in the manual.
- `git diff --numstat`: 423 added, 57 removed. Every removed line was read and is intended.
- A backup of the pre-merge manual is at
  `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/4c8f3b39-c0f3-4916-81cd-95247f75baec/scratchpad/reference-manual.before.md`.
  `git diff HEAD -- docs/reference-manual.md` shows the same change.
