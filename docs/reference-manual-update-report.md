# Reference manual update — V15.9 → V16.0

**Date:** 17 October 2026
**File changed:** `docs/reference-manual.md` (31,597 → 31,955 lines). Nothing else in the repository was touched.
**Delta applied:** `~/Downloads/reference-manual-delta-languages-midnight.md` (session 14–17 October 2026).

## Summary

The delta has been merged in full:
- each block is placed by its heading text;
- contradicted lines are corrected in place (31 lines changed; no other existing text removed);
- the previous delta's open items are closed in place;
- the changelog entry is at the top of "# Changelog".

The version moved from V15.9 to **V16.0**.

## The prompt

No span arrived garbled, and no two instructions contradicted each other. Three points in the delta needed a judgement call; they are listed under "Points to check" below.

## Version

**V15.9 → V16.0.** The manual's own precedent decides "next minor" after .9: the two most recent were V13.9 → V14.0 and V14.9 → V15.0 (changelog lines 344 → 321 and 1096 → 978). An older V11.9 → V11.10 exists, but it is not the current practice.

The version is bumped in all three places it appears, checked with grep:
- the header (line 1): `HatchGrab Engineering Reference Manual · V16.0`;
- the front matter (line 9): `**Version 16.0**`;
- §49's title: "Deploy posture (current at V16.0; …)".

## Where each delta block went

| Delta block | Placed at | How |
|---|---|---|
| Proposed changelog entry | `## V16.0 — 14–17 October 2026 — …` at the top of "# Changelog" | Includes a "Where" table, the in-place corrections, and the delta-vs-manual notes |
| Languages (UPDATE) | §77 | Phase 0 details folded into §77.4. New subsections: §77.6 How words are read, §77.7 What each phase moved, §77.8 US behaviour, §77.9 Proof method, §77.10 Open. Decisions appended to §77.2 under "Later decisions". Rule 1 extended in §77.5, plus the `language.mdc` note |
| Marketing site and SEO (NEW subsection; with landing/marketing) | §48 "The landing page and marketing surfaces" → new `### Country addresses and the router (V16.0)` at its end | Its Decision and Open are `####` subheadings |
| Schedules, discovery and the scraper (ADD) | §33, directly after "Schedules, discovery and the scraper by country (V15.8)" → `## Schedules, discovery and the scraper — private and generic events (V16.0)` | Both the venue-side block and the Village Foodie block |
| Events and the schedule — overnight events (NEW subsection) | §15 "Events and venues" → new `## Overnight events — events that run past midnight (V16.0)` at its end | The rule, the follow-ups, and the US format bugs |
| US readiness — layout (NEW subsection) | **§76.8**, inside §76 "International readiness — country settings" | **No section is titled "US readiness".** §76 is where the V15.8 US readiness sweep already lives (its sources list `us-readiness-sweep-report.md`). The subsection says so |
| Tooling and workflow (ADD) | **NEW §79 "Tooling and workflow", created at the end** | **The manual had no such section.** The closest are §22 Development process and §26 Testing and dev environment, but neither has that heading. The new section says so |
| Deploy posture (REPLACE) | §49 → new `### 🔴 DEPLOY POSTURE AT V16.0 …` leading the section | See "Points to check" 2 |
| Open backlog (UPDATE) | §27 → new `## Added V16.0 …` after the "Added V15.8" block; the V15.8 block corrected in place | "Keep" items already in the V15.8 block are referenced in one line, not repeated |
| Cross-cutting engineering invariants (ADD) | §35 → new `## 35.ah 🔴 TIME, DISCOVERY AND LANGUAGE INVARIANTS (V16.0)` after 35.ag | All nine invariants. The foreign-key and edge-mirror rules point back to §33 and §15, which hold the precedent, not a second copy of the rule |

## Older lines corrected in place (the delta wins)

**§15 Events and venues**
- "The end-after-start guard" now notes that an end earlier than the start is the next day, and that only end = start is refused.
- "Overnight events remain impossible, deliberately" is marked superseded, with a pointer. The V11 reasoning is kept as history.

**§27 Open backlog**
- The V11.14 "Overnight events" item is struck: built, and auto-open after midnight stays open.
- In the V15.8 block:
  - re-run `_16`: done;
  - language phases 1a onwards: done for English;
  - US screenshots, testimonial, URLs and hreflang, and the demo country: done;
  - the US App Store link: done;
  - the "Sept" item is narrowed: Phase 2 changed most sites; the rest are listed in `language-phase-2-report.md` §6.

**§33 Discovery**
- "`_16` must be re-run after deploy" now says it was re-run (OBSERVED).

**§48 The landing page and marketing surfaces**
- V12.5 sitemap line: marked superseded (`/landing` is now a 302; the sitemap holds country URLs only).
- V14.9 `/features` lines:
  - the canonical is now the country address;
  - the title and tags follow the page's country;
  - the sitemap entry is superseded.

**§49 Deploy posture**
- V15.9 posture: `_16` re-run noted. Its "no entry for Language 1a/1b" item is struck and closed.
- V15.8 posture: `_16` re-run noted.

**§76.5 Signup and landing by country**
- Marketing titles and tags follow the page's country, not the visitor's.

**§77 Languages**
- §77.1:
  - SEO: country URLs done;
  - "the demo is always provisioned as a GB truck" is struck (since Phase 2 it is built in the visitor's country).
- §77.2:
  - marketing follows the page's country;
  - the US word table was approved on 15 Oct.
- §77.3: a status line (0, 1a–1e and 2 done for English).
- §77.4:
  - "Nothing at runtime loads them" added to the dependency line;
  - an as-built note on server components;
  - the "Sept" line updated.

**§78.8 Open**
- Item 4 (no manual entry for Language 1a/1b) is struck and closed.

## Points to check

1. **"Remove its ⚠️ 'check against the report' line" (Languages, Phase 0).**
   - §77 carries no such line. The V15.8 merge had already checked the Phase 0 block against `docs/language-phase-0-report.md` and corrected it.
   - The only matching text is the V15.8 changelog's record of that check (line 113 before the merge). That record is history, so it was kept.
   - Nothing was removed. The delta's two "details to add" were already in §77.4 except "nothing at runtime loads them", which was added.
2. **"REPLACE the previous delta's block" (Deploy posture).**
   - §49's own title says earlier postures stay below, each dated, with the current one leading. Every earlier merge followed that.
   - I read "replace" as "replaces it as the current posture": the V16.0 block leads §49 and says it replaces the V15.9 and V15.8 postures as current.
   - The older blocks are kept as dated history, with their `_16` and Language 1a/1b items corrected in place.
   - If you meant the V15.8 block to be deleted outright, that is a one-block removal.
3. **Backlog "Close: loading only a truck's own language on Manage".** No such item was in §27, so there was nothing to close. The decision is recorded in §77.2 ("Part C … reverted").

**Side note, not changed:** the delta's list of pushed commits omits `c96fe5f` ("private events"), which is on `origin/main` between `a858ca5` and `692adb4` (from `git log origin/main`). The delta says "include", so the list is not claimed to be complete. It was copied as written, with its "Check `git log origin/main`" line.

## Duplicates avoided

- **Phase 0:** the extra dependencies and `typecheck.ts` were already in §77.4, so they were not added again.
- **Landing country order:** the router's order is the same as §76.5's. §48 says "the same order as §76.5" rather than adding a second explanation.
- **Allergen floor:** §77.10 points to §77.1 rather than restating it.
- **Backlog:** "keep" items already in the V15.8 block (the Maps key, US plan prices, Phase 5, legal, the revokes migration, the `discovery_events` key, reject reasons, the allergen floor) are named once in a pointer line, not re-listed.
- **Foreign-key rule and edge-mirror rule:** stated once in 35.ah, which points to the precedent in §33 and §15.

## Checks

- `grep -nE "V15\.9|Version 1[56]\.|V16\.0"`: the header and front matter read V16.0; §49's title reads V16.0. V15.9 remains only in history (its changelog heading, its posture, §78).
- Every replacement in the merge script required exactly one match (35 edits; any miss would have stopped it).
- `git diff` on the manual: 31 lines removed, and every one is an in-place correction listed above.
- Headings checked in order: §76.1–76.8, §77.1–77.10, §78, §79.
- The two harnesses that read the manual were run, and neither is affected:
  - `compare-no-system`: 54/54 pass;
  - `check-plain-english`: 111/112, the same one long-standing known violation as before.
- No database queries were run, and no SQL is needed for this update.
