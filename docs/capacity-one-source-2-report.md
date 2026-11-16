# capacity-one-source-2: committing capacity-one-source-1 (14 November 2026)

## Summary

The capacity-one-source-1 code is committed as **70ef124c**. The reference-manual entry is committed separately as **367c1e5b** (V16.23).

- The commits contain only this workstream's files.
- I reran the swept checks just before committing: **220 run, 215 passed, 5 failed**. The five failures are the same ones that failed before this work.
- Nothing is deployed. No data changed and no SQL ran in this step.

## The brief

- **Garbled spans:** none.
- **Contradictions:** none.

## 1. What git status held, and what went where

At the start: 162 tracked files modified and 9 untracked items.

### Committed in 70ef124c (177 files, +1824 / −263)

| Group | Files |
|---|---|
| Code | `app/(app)/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `app/api/dashboard/action/route.ts`, `components/manage/KitchenCapacitySection.tsx`, `lib/category-capacity-write.ts` (new) |
| Messages | `messages/<locale>.json`, `messages/ns/<locale>/manageMenu.json`, `docs/i18n/back/<locale>.json` (148 files) |
| New harnesses | `scripts/capacity-one-source-1.cjs`, `scripts/capacity-one-source-1-live.cjs`, `scripts/capacity-one-source-1-screens.cjs`, `scripts/_named-capacity-one-source-1.cjs` |
| Re-pinned harnesses | `scripts/van-category-settings.cjs`, `scripts/collection-times-hint.cjs`, `scripts/slot-interval-settings.cjs`, `scripts/schedule-graphics-places.cjs`, `scripts/_lp1d-named.cjs`, `scripts/_lp1d2-named.cjs`, `scripts/_moved-paths.cjs`, `scripts/harnesses.json`, `scripts/fixtures/language-phase-1d-us-changed.txt`, `scripts/fixtures/language-phase-1d2-us-changed.txt` |
| Docs | `docs/capacity-one-source-1-report.md`, `docs/capacity-one-source-1/` (8 screenshots + `backup.json`) |

How I checked that only this workstream's changes went in:

- **Message and i18n files:** I checked the diff of every modified file under `messages/` and `docs/i18n/back/`. No changed line in any of them is outside the `manageMenu.category.otherVans` key.
- **Code files:** I read the diffs of the four code files. Every hunk is part of this work: the single writer, `capacityView`, the other-vans line, the warnings on effective values, and the `any` casts cleaned up in `saveCat`. No other session's edits are mixed in.
- **Migration:** `20261103` was already committed on its own (b5a748b8), so it is not in this commit.

### Left alone: another workstream's files, still uncommitted

- `docs/gusto-move-1-report.md`
- `docs/gusto-move-1/` (`backup.json`, `record.md`)

These belong to gusto-move-1, which is a separate workstream. Its migration was committed as 78f9d77c, but the report and record never were. I did not commit, change or delete them.

## 2. Checks rerun before committing

### Swept checks (`node scripts/run-harnesses.cjs`)

**220 run · 215 passed · 5 failed.** This is identical to the capacity-one-source-1 final sweep.

| Failed | Cause (not this work) |
|---|---|
| paperwork-1 | `content/legal/ru-KZ/*.md` missing |
| legal-languages-1 | `content/legal/ru-KZ/*.md` missing |
| world-countries-3 | `content/legal/ru-KZ/*.md` missing |
| tidy-1 | `content/legal/ru-KZ/privacy-policy.md` missing (ENOENT) |
| contact-1 | the ru-KZ legal file; it also pins `planTable` to 3d6228b7 |

- `capacity-one-source-1.cjs`: 31 passed, 0 failed.
- `allergen-kitchen-1.cjs`: 30 passed.

### TypeScript and lint

- **`tsc --noEmit`:** no errors.
- **eslint on the touched files**, compared with their HEAD versions (piped in through `--stdin`):

| File | HEAD | Now |
|---|---|---|
| `app/(app)/manage/[token]/page.tsx` | 235 errors / 81 warnings | 232 errors / 81 warnings |
| `app/api/manage/route.ts` | 20 / 7 | 20 / 7 |
| `app/api/dashboard/action/route.ts` | 19 / 1 | 19 / 1 |
| `components/manage/KitchenCapacitySection.tsx` | 0 / 0 | 0 / 0 |

  - Nothing new was added. The three fewer errors on the page are the `any` casts removed in `saveCat`.
  - The five new files have 0 errors and 0 warnings.

### After the commit

Several harnesses compare the working tree with HEAD, so I reran the ones this work touches on the committed tree. All exited 0:

- capacity-one-source-1
- van-category-settings
- collection-times-hint
- slot-interval-settings
- schedule-graphics-places
- loyalty-1
- cwv-2
- costs-accounts-1
- language-phase-1d
- language-phase-1d2

## 3. Reference manual (367c1e5b)

`docs/reference-manual.md` changes:

- **Version:** the header and title page go from V16.22 to **V16.23**.
- **New changelog entry:** "V16.23 — 14 November 2026 — PREP TIME AND ITEMS PER BATCH COME FROM ONE PLACE". It says:
  - The values are the first van's, as the resolver gives them.
  - There is one server writer, `lib/category-capacity-write.ts`. It goes through `upsert_van_category`, fans out to the vans that follow Van 1, and mirrors into `menu_categories` so no-van events read the same values.
  - It lists every caller, and that deleting Van 1 re-mirrors the next first van.
  - A van that doesn't follow Van 1 is pinned to its current values before the mirror.
  - Multi-van trucks whose vans differ get the "Van 1. Other vans: Kitchen capacity tab." line.
  - The warnings use the effective values.
  - The order maths and the 1-vs-999 batch default are unchanged; the default is noted, not fixed.
  - The test-truck data sync (migration `20261103`).
  - The proof scripts.
- **§66.3 "Writers":** its paragraph said the Menu tab and Dashboard editors write `menu_categories` directly, which is no longer true. I left that paragraph as it was and added a short "V16.23 — superseded" note under it.

No harness pins the manual's version or text: I grepped `scripts/*.cjs` for V16.22 and found nothing.

## 4. SQL

None. This step made no database reads or writes. The SQL for capacity-one-source-1 is in `docs/capacity-one-source-1-report.md`.

## 5. Not done, as the brief says

- **Not deployed.**
- **No data changes.**
- **This report is not committed:** the brief asked for two commits, the code and the manual. It is ready to be committed whenever wanted.

## 6. Still open from capacity-one-source-1 (unchanged)

These need a decision. They are described in `docs/capacity-one-source-1-report.md`:

- **The batch default:** slots and the dashboard read a missing batch as 1, but `buildCatConfigs` reads it as 999.
- **Menu-commit reactivation of a soft-deleted category.**
- **Go-live checks that are not wired in.**
- **French wording:** I used "camion", the existing term, not "véhicule".
