# Manual update, pass 2 — 8 September 2026 (afternoon/evening)

**Scope: two files. `docs/reference-manual.md` V12.4 → **V12.5**, `docs/scraper-reference-manual.md` V1.2 → **V1.3**. No code changed. No database row read, written or deleted. No Sheet touched. Nothing staged, committed, pushed or reverted.**

---

## GIT STATUS

**START (before any edit):**

```
 M app/admin/outreach/page.tsx
 M app/admin/page.tsx
```

`HEAD` = `origin/main` = `6fe8634`.

**END:**

```
 M app/admin/outreach/page.tsx
 M app/admin/page.tsx
 M docs/reference-manual.md
 M docs/scraper-reference-manual.md
```

`HEAD` = `origin/main` = `6fe8634` — **unchanged.** The only new entries are the two manuals. **The two pre-existing modified files were not touched.** Nothing was staged.

**Diffstat:**

```
 docs/reference-manual.md         | +157 / -3
 docs/scraper-reference-manual.md | +256 / -8
```

The deletions are the in-place corrections (old headings and old claims replaced), not removals of content — **every superseded value is quoted in the text that replaced it.**

---

## WHAT WAS WRITTEN, ITEM BY ITEM

### A — the 51 silent trucks (scraper manual)

**Rewrote the section heading and its first bullets.**

- **OLD VALUE (V1.1 heading, carried into V1.2's body):** *"51 SILENT TRUCKS THAT TURNED OUT TO BE ONE STRATEGY"* and *"100% OF FAILURES ARE `scroll_lazy`. EVERY `manual`, `click_next` AND `scrape_rules` TRUCK WORKS."*
- **NEW:** a four-row cause table — exclusion-filter kills (5, **proven and fixed**), genuinely no events (**not a fault**), Facebook logged-out walls (33), and **10 `manual` trucks, UNEXPLAINED** — plus the measured rates 🧪 `scroll_lazy` **47/82 = 57%** vs `manual` **10/22 = 45%**, and the base-rate caveat that 🧪 **82 of 109 site-list entries are `scroll_lazy`**.
- Added ✅ **[RESOLVED V1.3] a Facebook page has now actually been fetched** — 🧪 a **2,272-character logged-out wall**, with the explicit limit that **one page was fetched, not thirty-three**.
- **The V1.1 changelog heading itself now carries a superseded marker in place**, because a heading is what a skim-reader takes away.

### B — the three invisible silencers (new §10, scraper manual; also folded into app-manual §33)

`discovery_trucks.excluded` (✅ admin toggle) · **the Sheet's Exclusions tab (🔴 no interface anywhere)** · **prose inside a site's `ai_instructions` (🔴 free text)**. Recorded together, with the point stated as the finding: **they share no state and no audit trail**, so 🧪 **an operator can read `excluded = false` in the console and still be silent.**

🧪 The Common's instruction says *"Do NOT extract Kerief or Just Baked By Sophie"* and **both are on The Common today** — **that pass under-extracts two trucks a week and nothing reports it.**

### C — the exclusion filter, fixed and unfixed (new §11)

✅ Fixed half, with the 🧪 **143/143 venue / 0/143 truck** evidence and the accepted cost (a truck page's quiz night is now kept) recorded rather than left to be discovered.
🔴 **Still-open half at `:784-790`** carried forward as OPEN, including **why it was deferred** (its guard sits inside the awaited-writes hunk).
⚠️ **Provenance carried forward as UNRESOLVED**, with the reason it cannot be settled from here — 🧪 **the Drive API is disabled on Google Cloud project `227274860029`** — and an explicit statement that **the machine-generated character of the tab attributes no specific row and I did not guess.**

### D — Saffron Walden (new §12)

🧪 duplicate Sheet rows 359/360 → the page is parsed twice · 🧪 identical 1,542-char flat `innerText` · 🔎 the unconditional `finalVenue = site.name` stamp · the stop-at-marker vs skip-the-prefix asymmetry, with 🧪 the Railway Arms list a strict superset **on all four broken dates**.
⚠️ **The "nine trucks at nine DISTINCT pitches on 4 June" claim is corrected in place: 🧪 the page has only ever had two pitches.** The surviving substance (12 of 16 dates clean) is stated as surviving.
🔴 The stamp is recorded as **STILL OPEN across all seven venue-page sites**, and ⚠️ **two of those seven were never fetched**, so "only Saffron Walden is multi-pitch" is explicitly **not established**.

### E — the third guard and the two rules that died (new §13; also in app-manual §33)

- 🔴 **Postcode arbitration WITHDRAWN, not gated** — with the structural reason (**no term for where the EVENT is**), 🧪 **11/15 → 3/15**, 🧪 **753 of 1,011 rows overridden**, 🧪 **one tie won from 97 km**, and ⚠️ **the single-case validation that let it through.**
- 🔴 **Truck-radius as a REVIEW TRIGGER** — 25/50/100 km, 🧪 **15 of 21 caught but the 44.1 km Swan mislink ACCEPTED**, 🧪 **105 of 173 trucks have 0 or 1 anchor and must HOLD.**
- ⚠️ **The gauntlet removed 7.5% of pairs and halved the pooled p95, 383 → 194 km** — recorded as the finding that outlives the thresholds.
- ⚠️ **The gauntlet fails 20 venues, not V1.1's 103** — marked **stale, not wrong-at-the-time.**
- ✅ **Guard three SHIPPED**, 🧪 46.7% / 34.1%, with 🔴 the `Thirsty` [Cambridge] case stated as **the reason it flags rather than decides — it would have decided wrongly on its own showcase case** — and both limits carried forward: 🧪 **205 of 221 UNCHECKED (93%)** and 🔴 **unlinked-only scope, so the rows that motivated it are invisible to it.**

### F — `ai_notes` postcodes (new §14 in the scraper manual, new subsection in app-manual §33)

🧪 **774 of 2,229 rows carry a postcode and nothing reads it.** 🔴 **Coverage is structural: 1,100 of 1,104 from `URL:` alone; `Drive Screenshot`, `hg_scraper`, `hatchesup_scraper` and `Manual Entry` produce ZERO** — so ⚠️ **it is not a sample and any rule needing it is unavailable for 1,455 rows by construction.** ⚠️ 146 distinct postcodes, 🧪 **32.8% placeable.** ✅ It gets both known `findVenue` failures right and catches the 370 km Cumbria case 🔴 **the coordinate gauntlet structurally cannot see.**

In the app manual this is written as **the second column in §33 that is written at insert and never consulted, after `updated_at`** — the pattern, not just the instance.

### G — landing and SEO (app manual §48)

All five recorded: ✅ the page is `index, follow` with 🧪 **metadata verified in the SERVED head**; 🔴 the **five days of `noindex` on a reason that expired on 3 September**; 🔴 the **75-char double-brand title, with the previous title carrying the identical flaw**; ⚠️ the **robots.txt correction and its cause (a zsh glob failure printing the same line as a true negative)**; 🔴 **`Disallow: /trucks/` as a STANDING DECISION**; ⚠️ the one-URL sitemap with `/pricing` not-a-route and `/landing` 308-ing; and the **decided** keyword scoping (POS not contested, "street food" is a diner term, "mobile catering" used).

WhatsApp: ✅ **one flag in `lib/whatsapp-live.ts`, committed `false`** (🧪 verified: it is in `6fe8634` and reads `false`), with 🔴 **the position following the flag, not just the words**, and 🔴 **the first heading on the page to carry `soon-inline` — recorded as a precedent.**

### H — today's deploy (scraper §15, app §49)

🧪 **Three commits today; `HEAD` = `origin/main` = `6fe8634`, pushed 17:38.** 🔴 **Red-on-failure means previously-green runs may now go red at 06:00, and a red run is not automatically a regression.** 🔴 **`20260907_discovery_run_log.sql` written and NOT APPLIED — the code warns once on `42P01` and continues, so the run log does not exist.** ⚠️ Two admin files remain uncommitted behind the deploy.

---

## 🔴 CORRECTIONS I MADE TO THE TASK'S OWN POINTERS — AND ONE I GOT WRONG FIRST

The manual carries a standing rule that **a stale pointer is worse than none**, so every `:NNN` in the prompt was re-read against the committed file rather than copied.

| pointer as given | what the committed file says | verdict |
|---|---|---|
| `:851` exclusion check | 🔎 **`:859-869`**, `isExcluded` at `:861` | **STALE** — the fix itself added five lines |
| `:871` `finalTruck = site.name` | 🔎 **`:885`** | **STALE** |
| `:906` `finalVenue = site.name` | 🔎 **`:920`** (`finalVenue` initialised `:914`) | **STALE** |
| `:784-790` `exclusionsToAdd` append | 🔎 loop opens `:779`, checks `:780-782`, append `:784-789`, `excludedTerms.add` **`:790`**, upsert `:792` | ✅ **CORRECT** |
| `:455` `validTrucks` | 🔎 **`:455`** | ✅ **CORRECT** |

🔴 **I called `:784-790` stale, wrote that into the manual, then re-read the block and found it correct.** The manual now says so explicitly, in the same sentence as the pointer, rather than quietly carrying the right number with no trace. **The error was mine: I inferred the range covered the whole loop from the surrounding narrative instead of counting the lines.**

⚠️ I also corrected **three pre-existing V1.2 pointers** that the exclusion fix had silently invalidated — §4.3's `:871` region, §4.8's `:851`, §7.3's `:851` — each marked with the old value struck through and the re-read date. **They were correct when V1.2 was written this morning and were stale by this evening. That is the eight-hour half-life the manual warns about, demonstrated.**

---

## EVIDENCE, AND WHAT WOULD HAVE LOOKED THE SAME IF IT PROVED NOTHING

**This pass is a documentation pass. I did not re-run the afternoon's experiments; I folded in their reported results.** What I did verify directly, here, this evening:

| claim written | how checked | what a false positive would have looked like, and how it was ruled out |
|---|---|---|
| `HEAD` = `origin/main` = `6fe8634` | 🧪 `git rev-parse --short HEAD` / `origin/main` | ⚠️ **`git rev-parse HEAD origin/main` in one call FAILED** — *"Needed a single revision"* — and a failed command prints to the same stream as a result. **I re-ran them as two separate calls and read two identical hashes.** This is the same class of error as the robots.txt glob failure recorded in §48. |
| three commits dated 8 September | 🧪 `git log --pretty='%h %ad %s'` with `--date=short` | A commit's author date can be set arbitrarily. **Not ruled out** — I am reporting the dates git holds, not proof of when work happened. |
| `lib/whatsapp-live.ts` committed and `false` | 🧪 `git log -1 --` on the path (returns `6fe8634`) and `grep` for the export (`= false`) | A file present in the working tree but untracked would show **no** commit line; it showed one. A flag flipped in an uncommitted edit would show a `M` in `git status`; it does not appear there. |
| the migration is written and not applied | 🧪 `ls -la supabase/migrations/` — the file exists, 5,469 bytes, 7 Sep 11:59 | 🔴 **The file existing proves only that it was written. I did NOT query the database** — per the standing prohibition on touching rows — **so "not applied" rests on the afternoon's report, not on a fresh check.** Recorded that way in both manuals. |
| the deploy reached production | 🧪 commits + push state only | 🔴 **NOT ESTABLISHED HERE.** A pushed commit and a deployed build are different facts. **I did not query Vercel**, and both manuals say so rather than letting "deployed" stand unqualified. |
| every corrected line number | 🧪 `grep -n` / `sed -n` against `scripts/run-scraper.js` at `HEAD` | A grep matching a **comment** rather than the executing line would read identically. **Ruled out by printing the surrounding block**: `:885` and `:920` are assignments, `:861` is the `const isExcluded` binding. The one line I quote from a comment (`:853`) is labelled as a comment. |

**Extensions searched when locating code:** `.js` and `.ts` explicitly, plus unscoped `grep -n` across the named files. **No search in this pass was scoped by extension** — `run-scraper.js` is JavaScript and the guards are TypeScript, and both were read.

---

## 🔴 CARRIED FORWARD AS UNRESOLVED — NOT RESOLVED BY OMISSION

Added to the scraper manual's **WHAT I COULD NOT READ OR VERIFY** section, each marked `[NEW V1.3]`:

- 🔴 **Who edited the Exclusions tab** — no timestamps, no author column, **Drive API disabled on project `227274860029`.**
- 🔴 **The 10 silent `manual` trucks** — they never fetch a page, so no explained cause applies. **UNEXPLAINED.**
- ⚠️ **Two venue-page sites never fetched** (`Nethergate Brewery`, `The White Horse`).
- 🔴 **Whether the 8 September deploy reached production.**
- 🔴 **Whether the 06:00 cron goes red tomorrow** — the red-on-failure changes have never run on a schedule.

And in the defect table (§6), five new rows: the fixed exclusion filter (12), **the unguarded `exclusionsToAdd` append (13)**, **the unconditional `finalVenue` stamp (14)**, **prose rules in `ai_instructions` (15)**, **the 10 unexplained `manual` trucks (16)**, and **the unapplied `discovery_run_log` migration (17)**.

---

## WHERE TWO SOURCES DISAGREED, AND WHAT I DID

1. **V1.1/V1.2's "one strategy" vs the afternoon's measurement.** ⚠️ **Recorded as a correction with the old text quoted, in the body AND on the V1.1 changelog heading** — not silently replaced. The half of the original claim that survived (**33 separate stop days**) is stated as surviving, so the correction does not read as a blanket reversal.
2. **V12.4's "the Saffron Walden gap is proven; its cause is not" vs today's root cause.** ✅ Resolved, with the old sentence quoted, **in the same section** — so a reader of §33 meets the correction next to the claim.
3. **The task prompt's `:784-790` vs my own re-read.** 🔴 **My re-read was wrong and the prompt was right.** Recorded above and in the manual.

---

## WHAT I DID NOT DO

- **No `git add`, in any form.** No commit, push, revert, checkout, restore or stash. 🧪 `HEAD` is byte-identical before and after.
- **No database access of any kind** — no read, no insert, no update, no delete, no migration written or applied.
- **No Google Sheet access.**
- **No code file changed.** The two modified app files in the tree are the earlier Outreach work and were not opened.
- **Nothing garbled in the prompt, and no instruction contradicted another** — so nothing was stopped for.

---

## THE STANDING LESSONS RECORDED IN BOTH MANUALS

- 🔴 **A headline can be wrong twice.** "One strategy" survived V1.1 → V1.2 because nobody re-measured. **Check the base rate before naming a mechanism.**
- 🔴 **Measure your own proposal before documenting it as a plan.** Postcode arbitration read beautifully and scored **3/15**.
- 🔴 **A guard that would decide wrongly on its showcase case must not be allowed to decide.**
- 🔴 **Read the served output, not the source, for anything a framework composes.** The double-brand title was correct in every file that touched it.
- 🔴 **A comment is not a gate, and it does not expire when the gate does.**
- 🔴 **A check that cannot fail loudly is not a check.** A shell glob failure and a true negative printed the same line — twice today, in two different tools.
- ⚠️ **Fixing one end of a loop is not fixing the loop.** The exclusion filter no longer eats trucks; the writer that feeds it is untouched.
