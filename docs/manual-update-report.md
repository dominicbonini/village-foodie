# Manual update — V12.9 and V1.9

**Documentation only.** Two files changed: `docs/reference-manual.md` and
`docs/scraper-reference-manual.md`. No code, no schema, no migration, no database write. Every number was
re-derived against the live database on **11 September 2026 at 11:45 UTC** before it was written down.

Nothing in the brief arrived garbled. Two of its statements did not survive re-derivation and are
corrected below rather than copied into the manuals.

---

## 🔴 FIRST: A VERSION OF THIS TASK HAD ALREADY RUN. I DID NOT WRITE A SECOND DELTA OVER THE FIRST.

**V12.8 and V1.8 already existed**, both dated 9 September 2026 (night), and between them they already
cover **items 1, 2, 3, 4, 5, 9, 10 and most of 11** of the brief:

| brief item | already covered by | where |
|---|---|---|
| 2 · the inertness class, all three mechanisms, sweeps OUTSTANDING | V12.8 | §35, §52.6 |
| 3 · untrusted URLs from scraper-written columns, sweep OUTSTANDING | V12.8 | §35 |
| 1b, 1c · the three §14 media claims, corrected in place | V12.8 | §14 |
| 9 · the whole outreach system, and that almost none of it was observed running | V12.8 | §52, §52.3 |
| 10 · the phantom defect and the five normalisers | V12.8 / V1.8 | §52.5 / §21a |
| 4 · the run log and `PGRST205` | V1.8 | §6, §8 |
| 5 · the 3,444 deletions, the Sheet dependency, `DEDUP_FROM`, `Y (0)` 103 → 1 | V1.8 | §8.1 |
| 11 · figures that moved | V12.8 / V1.8 | §52.4 / §22 |

**So I wrote the next versions — V12.9 and V1.9 — covering only the 10–11 September work and the claims
those two days falsified.** Nothing from the list above is restated; both new entries open with a line
saying so and pointing at the older entry.

**What was MISSING, and is what the new deltas contain:** the entire dedup gate (brief item 6), the
re-diagnosed venue-matching wall (item 7), the trading-truck confirmations (item 8), a single
consolidated outstanding list (item 12), and **item 1a — the venue-matcher backlog entry, which V12.8 did
not touch and which was still being read as open.**

---

## WHERE EVERY EDIT WENT, AND WHAT IT REPLACED

A longer file proves nothing, so each edit is named by what it displaced.

### `docs/reference-manual.md` — six edits

| # | edit | what it replaced |
|---|---|---|
| 1 | line 1 header `· V12.8` → `· V12.9` | the running header |
| 2 | front matter `**Version 12.7**` → `**Version 12.9**` | 🔴 **the front matter was already TWO releases adrift** — it read 12.7 while the header read 12.8. This is the exact drift the manual's own standing rule exists to prevent, and V12.8 committed it. Both strings now agree. |
| 3 | new `## V12.9` changelog block | inserted **directly under `# Changelog`, above `## V12.8`** — newest first, matching the file's existing order. Nothing was removed. |
| 4 | **Backlog · "VENUE MATCHER — sole candidacy is treated as certainty"** | 🔴 **rewritten in place, struck through, not annotated beside.** The old paragraph — the `cands.length === 1` claim, the `574 venues` aside, the PROVEN LIVE example and the A+C fix plan — is gone and replaced by the correction. ⚠️ **The half that is still true was deliberately kept and marked as not struck**: `discovery_events` still has no confidence column. |
| 5 | `## 52.6 Outstanding` heading + a two-line pointer | the heading now reads **"(V12.8 — SUPERSEDED BY §53.8, WHICH IS THE SINGLE LIST)"**. Its items were **not** deleted — they are the record of 9 September — but readers are sent to the one current list. |
| 6 | new `# 53.` with §§53.1–53.8 | appended **after §52.6 and before the `*End of manual*` footer**, which is still the last line of the file. It replaced nothing. |

### `docs/scraper-reference-manual.md` — five edits

| # | edit | what it replaced |
|---|---|---|
| 1 | header `· V1.8` → `· V1.9`, and `**Version 1.8 · 9 September 2026 (night)**` → `**Version 1.9 · 11 September 2026**` | both strings, which agreed already |
| 2 | new `## V1.9` changelog block | inserted under `# CHANGELOG`, above `## V1.8` |
| 3 | **§5 live counts** | 🔴 **the sentence `574 venues, 46 with a NULL village, 24 where village equals name, 1 with no coordinates` is GONE**, replaced by the re-derived counts plus a marked note of what the old figures were. |
| 4 | **§22 headline** | 🔴 **`venue_id is null on 404 of 902 rows (44.8%)` is GONE**, replaced by the current figure and a pointer saying §22.2's diagnosis is now only half the cause. |
| 5 | new `## 22.4` and new `# 23.` | inserted **before `# WHAT I COULD NOT READ OR VERIFY`**, so the unread/unverified list stays at the end where the file keeps it |

---

## THE NUMBERS, RE-DERIVED 11 SEPTEMBER 11:45 UTC

| | value | previous value recorded |
|---|---|---|
| `discovery_events` | **935** | 4,340 → 896/902 → 920 earlier today |
| future (≥ today) / past | **705 / 230** | — |
| rows with `venue_id` NULL | **322** (226 of the future rows) | 404 of 902 |
| rows marked superseded | **16** — 8 `postcode`, 6 `distance`, 2 `name-time`, **0 `identical-coords`** | 13 |
| `venues` | **819** | 574 |
| venues: no village / village = name / no coordinates / no postcode | **43 / 31 / 91 / 230** | 46 / 24 / 1 / — |
| `discovery_trucks` | **231** | — |
| `discovery_run_log` | **348** | 232 |
| outreach prospects | **231**, `whatsapp_confirmed` **30**, `contact_name` **2** | contact_name 3 |
| `hu_ordering = Y` | **17** | 19 |

## 🔴 TWO STATEMENTS IN THE BRIEF THAT DID NOT SURVIVE RE-DERIVATION

1. **"`contact_name` exists on 3 of 231 rows."** 🧪 It is **2 of 231** — `Tikka Tonic` ("Madhur") and
   `Pizza Mondo` ("Jo"). The manuals record 2.
2. **"`Chai Stall`'s `photo_url` pointing at a file that does not exist"** — listed as outstanding.
   🧪 **It is closed, and V12.8 had already closed it.** I went further and swept **all 242**
   `photo_url`/`logo_url` values across the 231 trucks: every remote URL returns **HTTP 200** and every
   local path exists on disk. **0 broken.** §53.8 records the sweep, not just the one row.

**And one piece of shorthand that the code contradicts.** The brief says the gate is "🔴 NOT in
`/api/inbound-schedule`". 🔎 **The gate IS called there** — `admitDiscoveryEvents` at the top of the
handler — and the bridge loop below it iterates the same untrimmed `rows` array it always did. What is
forbidden, and what the code does not do, is let dedup **trim the row list before the bridge loop**. The
manual records the rule that way, with the reason: a duplicate in the feed is untidy, a missed approval
takes a trading decision away from the operator. **The code wins, and §53.1 says so explicitly** so the
shorthand is not read later as "the gate must be removed from that route".

## OTHER CORRECTIONS MADE IN PLACE

- **The venue-matcher "sole candidate = certainty" defect was still listed as OPEN** in the app manual's
  Backlog. 🔎 `findVenue`'s single-candidate branch now calls `villageAgrees` and then
  `applyDistanceCeiling`, exactly as the multi-candidate branch does; the old line survives only as a
  quoted comment. Fixed in the code at V1.1 on 7 September, **struck in the manual only now** — it had
  been read as open twice in this series, which is why it was rewritten rather than annotated.
- **The scraper manual's 574-venue count** appeared in two places. The §5 live-counts line is corrected;
  the `574 → 558` line in §9 is **historical** (it records a merge that happened) and was deliberately
  left alone.
- **A self-contradictory line I wrote and then caught** in §53.8: it said "four migrations, of which two
  are unapplied" and then listed both as applied. 🧪 Re-checked: **all four are applied** — the last
  proved by the 2 live `name-time` marks, which only its widened CHECK constraint permits. The entry now
  records the sharper fact: **the database is ahead of `main`** — the schema and the marked rows exist in
  production while the code that reads and writes them exists only in this working tree.

## WHAT THE NEW SECTIONS SAY, IN ONE LINE EACH

**App manual §53** — §53.1 one gate and its three callers, and why it may not trim the bridge; §53.2 R5
and the NULL-by-design rule; §53.3 the four rules, with the identical-coordinate rule recorded as
**unreachable by construction** and the 4-character floor as load-bearing; §53.4 stored-and-hidden
duplicates and the four columns; §53.5 the two backfill defects, one of which touched live data and
cannot be repaired by a re-run; §53.6 venue matching as the largest open item, with the 225 refusals
grouped by cause; §53.7 the trading-truck rules including the structural proof that **no `onConflict`
anywhere targets `truck_events`**; §53.8 the single outstanding list, ten items.

**Scraper manual §22.4 and §23** — §22.4 re-diagnoses the linking gap as venue data rather than plumbing;
§23 covers the POST to `/api/discovery/ingest`, the auth and red-run behaviour, the gate's four steps,
that this is the **first duplicate check in the pipeline that reads the database rather than the Sheet**,
and the grouping-key defect that the gate never had.

## HOW I CHECKED

Both manuals were read for existing coverage before anything was written, which is what caught the
already-present V12.8/V1.8. Every count came from a `content-range`-asserted query or from running the
shipped code against the live table. Code claims were verified by reading the code, not the reports:
`findVenue`'s single-candidate branch, the gate's placement in the inbound route, the absence of any
`onConflict` on `truck_events` (repo-wide grep, **no extension filter**), and the 242 media URLs. Each
edit was applied with an exact-match assertion so it could not land twice, and after writing I confirmed
every new heading and version string appears **exactly once** and that the `*End of manual*` footer is
still the last line.

**Not done:** no code, no schema, no migration, no database write, no scrape, nothing installed, and
`truck_events` was not read.
