# Manual update — V13.0 and V2.0

**Documentation only.** Two files changed: `docs/reference-manual.md` and
`docs/scraper-reference-manual.md`. No code, no schema, no migration, no database write. 🧪 `git status`
shows only those two files modified.

**No delta for this material existed.** The highest versions were **V12.9** and **V1.9**, so these are
**V13.0** and **V2.0** — not a second delta over a first. The working tree was clean when I started,
which is itself a fact worth recording: everything V12.9 described as "built and uncommitted" is now
committed and deployed.

**Every figure below was re-derived from the live database at 2026-09-11T20:22Z**, not carried from the
source reports.

---

## 🔴 THE FIGURE THIS SERIES CARRIED WRONGLY — THE SEVENTH CORRECTION, AND IT IS MINE

| scope | rows |
|---|---|
| `village = venue_name`, **whole table**, normalised | **76** |
| …by exact string equality | 69 |
| …**future-dated only** | **71** |
| …**written by `Manual Entry`** | **62** ← the number three of my reports and one SQL snippet carried |

**62 is a by-writer subset, not the table count.** By writer: `Manual Entry` 62, `URL:` 12, other 2. It
came from a cross-tab in the diagnosis and I promoted it to "the table figure" in
`extraction-prompt-fix-report.md` without re-deriving. **It is corrected in place in both manuals and
called out in both changelogs as my error.**

## The rest, re-derived

| | value |
|---|---|
| `discovery_events` | **933** (future **703**) |
| `venue_id` NULL | **326** — up from 321; five wrong links nulled by hand |
| village NULL | **28** |
| `venues` | **819** |
| `discovery_trucks` | **231** · `discovery_run_log` **348** |
| the `hrefFromStoredUrl` regression set | **360** = `discovery_trucks.website` 102 + `venues.website` 258 |
| `discovery_run_log.url` non-http | **6** `about:blank` + **3** scheme-less |

## Code claims checked against the code, not the reports

| claim | verdict |
|---|---|
| `safeHref` moved byte-identically, 936 bytes | ✅ 🧪 936, `export` the only edit |
| ten sinks, seven public, all guarded | ✅ 🧪 re-censused; 9 matched by pattern, +2 computed consts (`menuHref`, `orderHref`), −1 out of scope (`DemoWelcome`, an internally built demo URL) = **10** |
| `hrefFromStoredUrl` scheme filter | ✅ present |
| `pickBest` distance tie-break, id as fallback | ✅ present, keys (c) and (d) |
| `assertNoInventedVillages` wired | ✅ in `geo-validate.js`, called from `run-scraper.js` |
| `venueGroupKey` used by three surfaces | ✅ hook, card, venue page |
| prompts edited, control untouched | ✅ 🧪 `VILLAGE (MANDATORY)` **0**; `buildHgPrompt` **2**; wrap-safe `truly cannot be` **3** |

---

# WHERE EVERY EDIT WENT, AND WHAT IT REPLACED

A longer file proves nothing, so each edit is named by what it displaced.

## `docs/reference-manual.md` — seven edits

| # | edit | what it replaced |
|---|---|---|
| 1 | line 1 header `V12.9` → `V13.0` | the running header |
| 2 | front matter `**Version 12.9**` → `**Version 13.0**` | the cover version. 🧪 Both now read 13.0 — the standing rule's grep passes |
| 3 | new `## V13.0` changelog block | inserted **directly under `# Changelog`, above `## V12.9`** — newest first, the file's existing order. Nothing removed |
| 4 | **§35, the untrusted-URL entry** | 🔴 **the sentence beginning "⚠️ THE SWEEP IS OUTSTANDING:" is GONE**, replaced by the census result and a pointer to §54.1. The rest of that paragraph — the `Shika Shack` evidence, the two defects in the first `safeHref` — is untouched and still true. ⚠️ The **other** "SWEEP IS OUTSTANDING" in §35, the one for the three **inertness** sweeps, was deliberately left: those are still unrun |
| 5 | new **§35.x — A SUBSTRING TEST IS NOT A SCHEME TEST** | appended to §35, **before `# 36.`**. Replaced nothing |
| 6 | new **§35.y — A HARNESS THAT CANNOT FAIL PROVES NOTHING** | same place, immediately after 35.x. Replaced nothing |
| 7 | new **§54** with §§54.1–54.6 | appended **after §53.8 and before the `*End of manual*` footer**, which is still the last line. Replaced nothing |

**Two corrections made in place inside §53, not appended beside it:**

- **§53.6's opening paragraph** — the "225 future rows / 322 across the whole table" figures now carry a
  dated update saying `venue_id` NULL is **326**, that **17** of those rows now pass R5 because of the
  tie-break, and that the *writer* has been fixed, which repairs future rows and none of these. The
  cause table beneath it is unchanged and now explicitly marked as measured on 11 September.
- **§53.8's outstanding table** — row 2 (untrusted-URL sweep) rewritten to **✅ CLOSED V13.0**; row 4
  (venue matching) rewritten to **still open, still the largest, but smaller**; row 10 ("two days of work
  are UNCOMMITTED") rewritten to **✅ CLOSED**; **two new rows added**, 11 (the unbuilt ratio assertion)
  and 12 (the prompt change is unverified). ⚠️ The new rows first landed **above** rows 9 and 10; I
  caught that and re-emitted the four rows in numeric order, so the table reads 1–12.

## `docs/scraper-reference-manual.md` — five edits

| # | edit | what it replaced |
|---|---|---|
| 1 | header `V1.9` → `V2.0`, and `**Version 1.9 · 11 September 2026**` → `**Version 2.0 · 12 September 2026**` | both strings |
| 2 | new `## V2.0` changelog block | under `# CHANGELOG`, above `## V1.9` |
| 3 | **§22's headline figure** | 🔴 **`322 of 935` is GONE**, replaced by **`326 of 933`** with a dated note explaining the five hand-nulled links. The V1.9 correction note beneath it is kept, so the section now records both corrections in sequence |
| 4 | new **§24** (the extraction prompts) and **§25** (the assertion) | inserted **before `# WHAT I COULD NOT READ OR VERIFY`**, so the unread list stays at the end where the file keeps it |
| 5 | new **§26** (the matcher tie-break) | same block, after §25 |

---

# WHAT THE NEW SECTIONS SAY

**App manual §54** — §54.1 the URL class closed: 10 sinks, 7 public, two helpers whose contracts differ
on purpose, the 360-of-360 regression, and 🔴 the narrowing that `javascript:` was blocked by **React
19.2.3 and not by our code**, that `data:`/`vbscript:` passed through, and that at the three weak-guarded
sinks those were already inert so what the filter actually closed was the `startsWith('http')` gap.
§54.2 the tie-break, recorded as a tie-break **below** name and token overlap, with 913 of 933 unaffected
and 0 regressions. §54.3 the prompts: honest not correct, the venue-creation side benefit, the
re-scrape overwrite with 422 rows at risk and 421 publicly unaffected, and **unverified until a scrape
runs**. §54.4 the assertion and its **green-run caveat**. §54.5 the rendering guards and the grouping
change — 54 → 53 pages, one merge, zero splits, 16 of 99 events, why name-alone grouping was rejected,
and the five hand-nulled rows **named in a table**. §54.6 the 76-versus-62 correction.

**App manual §35.x and §35.y** — the substring-test class (made **twice in one file**, by
`includes('http')` and `startsWith('http')`, with `about:blank` in the run log as proof that non-http
values do arrive), and the five instrument failures with the practice that caught them.

**Scraper manual §24, §25, §26** — the three prompts as a production A/B, the assertion with its caveat,
and the tie-break. §24.2 also records, for the third time in this series, that `buildHgPrompt`'s escape
sentence **wraps across two lines** and that a single-line grep for it returns a false negative that
reads as a deleted control.

---

# THE OUTSTANDING LIST, AS IT NOW STANDS (§53.8)

| # | item | state |
|---|---|---|
| 1 | the three inertness sweeps | 🔴 **OPEN — still unrun** |
| 2 | the untrusted-URL sweep | ✅ **CLOSED V13.0** |
| 3 | the identical-coordinate rule's ordering | 🔴 **OPEN — unreachable, because the distance test fires first** |
| 4 | venue matching | 🔴 **OPEN, still the largest** — 53 events need a venue row that does not exist |
| 5 | three chained `superseded_by` winners | 🔴 **OPEN — a re-run cannot repair them** |
| 6 | the run log has no retention rule | 🔴 **OPEN** — 348 rows, ~42,000/year |
| 7 | the Escape defect on the schedule popup's delete dialog | 🔴 **OPEN** |
| 8 | the opt-out footer left the code for an Outlook signature | 🔴 **OPEN as a compliance risk** |
| 9 | `Chai Stall`'s `photo_url` | ✅ CLOSED |
| 10 | two days of work uncommitted | ✅ **CLOSED — tree clean, all deployed** |
| 11 | **the ratio assertion** | 🔴 **OPEN — deliberately unbuilt until a run exists to calibrate against** |
| 12 | **the prompt change is unverified** | 🔴 **OPEN until a scrape runs** |

# HOW I CHECKED

Both manuals were read for an existing delta before anything was written, which is what established that
V13.0 and V2.0 were new rather than duplicates. Every count came from a full read of the live tables with
the same normalisation the diagnosis query uses; every code claim was verified by reading the shipped
code rather than the report that described it, including a re-census of the ten sinks that accounts for
the two computed-const sinks a naive pattern misses. Each edit was applied with an exact-match assertion
so it could not land twice, and afterwards I confirmed every new heading appears **exactly once**, that
both version strings agree, that the `*End of manual*` footer is still the last line, and that the
inertness sweep's "OUTSTANDING" marker survived while the URL sweep's did not.

**Not done:** no code, no schema, no migration, no database write, no scrape, nothing installed.
