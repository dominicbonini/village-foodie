# Manual update — app V12.8, scraper V1.8

---

# 0. 🔴 FIGURES IN THE BRIEF THAT THE DATABASE CONTRADICTS

Every number was re-derived from the live database before being written down, count-asserted (fetched
length checked against a `count=exact` header). **Five figures supplied in the brief are already wrong**,
and one of them is impossible rather than merely stale:

| Brief said | Live 9 Sep | Verdict |
|---|---|---|
| `discovery_events` 4,340 → **896** | **902** | still moving as the scraper writes; recorded with that caveat |
| `venue_id` null on **2,267** ("re-derived today") | **404** | 🔴 **PRE-deletion.** 2,267 nulls is arithmetically impossible in a 902-row table. **Not carried forward.** |
| unlinked rate: `URL:` 38%, Drive Screenshot 83%, `hatchesup_scraper` 4.6% | **54.9%**, **86.2%**, **0%** | all pre-deletion; the deletion removed mostly-unlinked past rows, so every rate rose |
| backfills "cluster on 22 May (344) and 2 June (199), stop entirely after July" | 33 and 13 survive; **141 `URL:` rows created since 1 Aug are linked** | 🔴 **withdrawn as unprovable** — see §3 |
| emails **59**, phones **70** | **61**, **71** | measured earlier the same day |

Two figures in the brief were confirmed exactly: **`hu_ordering = true` is 17** (the manual's 19 was
stale) and the **`Y (0)` segment is 1** (`Test Kitchen`). `whatsapp_confirmed = 30` and `contact_name = 3`
also confirmed.

## 🔴 One claim in the brief I could not verify, and did not repeat

*"Gusto carries the FK on only 73 of 87 rows"* describes a pre-deletion state I cannot reconstruct — those
rows are gone. The **reason** the brief gives for excluding by name rather than by FK is sound and is
recorded as reasoning (`discovery_truck_id` is populated on only a fraction of a truck's rows), but the
73/87 split is **not** recorded as a measurement, because I cannot measure it.

## 🔴 And one claim that turned out to be already fixed

**`Chai Stall`'s `photo_url` pointing at a file that does not exist** — the brief lists this as
outstanding. 🧪 It now holds a `truck-media` storage URL that returns **HTTP 200**. It is recorded as
**RESOLVED**, and it is the one photo upload that was observed working.

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
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
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

no changes added to commit (use "git add" and/or "git commit -a")
```

`git add -A` / `git add .` were not run; nothing was staged.

## 🔴 Documentation only — proven, not asserted

🧪 `find app components lib scripts supabase -newer <pre-edit snapshot>` returns **nothing**. The only
files this task modified are `docs/reference-manual.md` and `docs/scraper-reference-manual.md`. The three
`M` entries above are from **earlier tasks today**, not this one.

---

# 2. WHERE EACH EDIT WENT, AND WHAT IT REPLACED

The brief is explicit that "added a section" and "appended it in the wrong place" both leave a longer
file. So: every edit, by location and by what it displaced.

## App manual — `docs/reference-manual.md`, 24,004 → **24,188** lines (2,540,610 → 2,559,732 bytes)

| # | Where | What it replaced |
|---|---|---|
| 1 | **§14 › Truck logo (V6.5) › the V11.45 block** | The summary line *"profile → discovery only · order page → operator, falling back to discovery · embed → operator only"* — **struck in place**, with the corrected three-surface reading directly beneath it |
| 2 | **§14 › the NOTE (V6.5) paragraph** | **Struck in full**, correction placed **above** it so the correction is read first. Also flags that the Section 27 backlog item it creates describes a mapping that does not exist |
| 3 | **§14 › the NOTE (V7.5) paragraph** | **Struck in full**, correction placed **above** it, naming *why* the fallback was removed (clearing a logo was invisible while it existed) |
| 4 | **§14, immediately after the struck V7.5 note** | **New** — the discovery feed's `foodPhotoUrl` → `discovery_trucks.photo_url` fallback, which §14 never recorded |
| 5 | **§35 Cross-cutting engineering invariants**, before the "measured difference between two prompts" entry | **New** — *A property being written is not the same as it being applied*, and *A scraper-written URL is untrusted input* |
| 6 | **New §52**, appended before the `*End of manual*` marker | **New** — the day's build, `outreach_templates`, the two data facts, the moved figures, the phantom defect, the outstanding list |
| 7 | **Changelog, above V12.7**; header line `· V12.7` → `· V12.8` | **New** entry |

🔴 **No correction was left as a note beside live stale text.** Every one of the three §14 claims is
struck through (`~~…~~`) with the correction placed **above or in place of** it. 🧪 `~~` count is **116 —
even**, so no strike is left unclosed; fenced blocks **66 — even**; **51** numbered sections, **no
duplicates**.

## Scraper manual — `docs/scraper-reference-manual.md`, 1,990 → **2,108** lines (221,080 → 233,454 bytes)

| # | Where | What it replaced |
|---|---|---|
| 1 | **§8.1 heading and opening** | *"Nothing in this repository deletes…"* → **`[SUPERSEDED V1.8]`**, with the 3,444-row deletion, why it holds, and its expiry. The six sweeps survive verbatim, renumbered **§8.1a**, because they are still true **of the code** |
| 2 | **The §"DELETION AND RETENTION" summary bullet** near the top | Corrected in place — still true of the code, no longer of the data |
| 3 | **Three places claiming the run log is "written and not applied" / "warns once on 42P01"** — the summary bullet, the **§6 defect table row 17**, and the body text | All three **struck and corrected in place**. Row 17 flipped to ✅ RESOLVED |
| 4 | **New §21a**, before §22 | **New** — the phantom defect and the five normalisers |
| 5 | **New §22**, before *"WHAT I COULD NOT READ OR VERIFY"* | **New** — the venue-linking gap |
| 6 | **Changelog, above V1.7**; header and `**Version 1.7 …**` line → 1.8 | **New** entry |

🧪 `~~` count **60 — even**; fenced blocks **26 — even**; **23** numbered sections, **no duplicates**.

---

# 3. THE CORRECTIONS, AND HOW EACH WAS VERIFIED

**(1a) `resolveTruckLogo` has no `discovery_trucks` fallback.** 🔎 `lib/truck-logo.ts` — its client and
truck-id parameters are **`_supabase` / `_truckId`, underscore-prefixed and unused**, and it returns
`null` on a null path. 🧪 All four callers (`/api/menu/[truckId]`, `/api/dashboard`, `/api/orders/[id]`,
`/api/manage`) pass `logo_storage_path` and nothing else.

**(1b) The public profile reads neither media column — and the correction is stronger than the brief
knew.** 🧪 `app/trucks/[slug]/page.tsx` and `TruckClient.tsx` contain **0** `logo_url`, **0** `photo_url`,
**0** `discovery_trucks`. The profile reads its truck row, logo included, from a **published Google Sheets
CSV** (`TRUCKS_CSV_URL`, column index 9). So the discovery columns do not reach that page by any route,
and the Section 27 backlog item premised on the old behaviour would be a new feature, not a fix.

**(1c) The discovery feed's photo fallback — recorded for the first time.** 🔎
`app/api/discovery/events/route.ts`, linked-truck branch: `foodPhotoUrl: truck?.cover_image_path ? … :
formatImageUrl(linked.photo_url || null, 'photos')`. 🧪 **4** discovery rows carry a `hatchgrab_truck_id`;
**3** of those carry a `photo_url` — Pizzeria Gusto, Real Thai Food, Tikka Tonic. The manual now notes the
asymmetry explicitly: the **logo** fallbacks are gone everywhere, the **photo** one survives on this one
branch.

**(4) The run log's guard tested the wrong code.** 🔎 `run-scraper.js` tests `error.code === '42P01'` —
the **Postgres** code — but the write goes through PostgREST, which returns **`PGRST205`**. 🧪 **7**
migrations in the repo document `PGRST205`, **6 of them pre-dating** today's, so the scraper is the
outlier. 🧪 `discovery_run_log` holds **116** rows after one run → ~**42,000/year**, with **no retention
rule** (`scraper_run_log`, by contrast, is pruned at 90 days).

**(5) Why the deletions hold.** 🔎 `existingEvents` is filled from `eventData` =
`getTabData(sheets, TABS.EVENTS)` — the Sheet, never `discovery_events`. 🧪 `DEDUP_FROM` appears **once,
in a comment**; the switch is not implemented. The manual now states the concrete consequence: the
database is missing 3,444 rows the Sheet still has, so **switching the dedup set to the database would
reverse every one of them.**

**(6) The venue-linking gap is enrichment, not scraping.** 🧪 `venue_id` appears **zero** times in
`run-scraper.js`; the mirror maps nine columns and none is `venue_id`. `/api/inbound-schedule` resolves
both FKs, which is why Apps Script rows link at 86.2% and the mirror's at 54.9%. 🧪 **27 of the top 30**
unlinked venue names have an exact `venues` row. 🧪 **10** `venues` rows contain "foodpark" for what is
one pitch, so a name-based backfill would cement the duplication.

**(7) The phantom defect.** 🧪 All five normalisers lowercase — checked individually, including
`scheduleNorm`, which **moved to `lib/schedule-match.ts` today** and is now imported by two callers rather
than re-implemented. Only **2** rows are genuinely orphaned under the code's own matching.

**(10) The two data facts.** 🧪 `whatsapp_confirmed = true` on **30**; **all 30** carry the scraped hint
`advertises`; there are **exactly 30** `advertises` trucks in the table — a 1:1 match, recorded against
the PECR constraint as *not consent evidence*. 🧪 `contact_name` on **3 of 231**, named.

**(2c) The named inertness instance.** 🧪 `z-[80]` is used by `components/native/AppLockGate.tsx` and
`components/dashboard/DemoWelcome.tsx` — two unrelated files whose usage is the only reason the rule
exists. `z-[85]` was used by **one** file, which is why it had no rule. Both admin overlays are now inline
styles (🧪 0 occurrences of either as a `className`), but the manual records the sweep as **outstanding**,
because one hardened call site is not a hardened class.

---

# 4. WHAT I DID NOT DO, AND WHY

- **No code, schema, migration or data write.** Proven by `find -newer` in §1.
- **No line numbers cited.** Every pointer is by symbol or by file, per the brief.
- **The backfill-date claim was withdrawn rather than repeated.** `created_at` records row creation, not
  when `venue_id` was written, and `updated_at` is bumped by every upsert on the same natural key — so the
  timing is not recoverable from this table in either direction. Recording "clusters on 22 May" would have
  been recording a measurement of a system I do not have, which is the very lesson §21a exists to teach.
- **The 73/87 Gusto FK split is recorded as reasoning, not measurement.** The rows are deleted.

---

# 5. EVIDENCE CLASS

- ✅ **Executed against the live database:** every figure in §0 and every 🧪 count in both manuals —
  902/156/746 events, 404 nulls, the per-writer linked rates, 815 venues, 27-of-30, the 10 foodPark rows,
  231 prospects, 30 WhatsApp / 3 contact names / 17 HU / 61 emails / 71 phones, the Y(0) segment, 116
  run-log rows, 6 template rows. All count-asserted.
- ✅ **Executed over the network:** Chai Stall's `photo_url` → **HTTP 200**.
- ✅ **Structural, extracted from source:** `resolveTruckLogo`'s signature and its four callers; the
  profile's 0/0/0 media references and its CSV source; the discovery feed's `foodPhotoUrl` branch; the
  `42P01` guard; `venue_id` absent from `run-scraper.js`; `existingEvents` from `eventData`; `DEDUP_FROM`
  comment-only; the five normalisers; the `z-[80]`/`z-[85]` co-user counts; both Escape listeners in
  capture phase.
- ✅ **Structural, on the manuals themselves:** section counts, duplicate-heading check, even `~~` and
  fence counts, and the before/after line and byte deltas.
- 🔴 **Reasoned only, NOT OBSERVED:** every claim in §52.1 about the day's build behaving correctly. **No
  admin agent session is obtainable, so nothing in the outreach console, events tab, schedule popup,
  compose window or templates tab has been seen running** — except the single Chai Stall photo upload. The
  manual states this at the head of §52 rather than burying it.
- ⚠️ **Not verified:** that the 3,444-row deletion excluded exactly the four named trucks. I can see the
  survivors and the totals; I did not witness the `DELETE` and cannot reconstruct its predicate.
