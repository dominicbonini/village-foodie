# Manual update, pass 3 — 9 September 2026 (evening)

**Scope: two files. `docs/scraper-reference-manual.md` V1.4 → **V1.5**, `docs/reference-manual.md` V12.5 → **V12.6**. No code changed. No database row read, written or deleted beyond the verification counts below. No Sheet cell touched. Nothing staged, committed or pushed; `git add` not run.**

---

## 0. `git status --short` — START and END

**START** — 3 modified, 10 untracked:
```
 M DEBUG_SCRAPED_TEXT.txt          M app/providers.tsx          M scripts/run-scraper.js
?? docs/auto-exclusion-write-report.md · match-from-recheck · match-from-switch
?? docs/posthog-route-scoping-report.md · sites-from-{switch,preconditions,widened}
?? docs/vercel-analytics-report.md · docs/sql/precondition-{1,2}-*
```
**END** — identical, plus ` M docs/reference-manual.md`, ` M docs/scraper-reference-manual.md` and `?? docs/manual-update-3-report.md`. `HEAD` = `origin/main` = `9e83a5e`. Nothing staged. **The three pre-existing modified files were not touched.**

**Diffstat:** `scraper-reference-manual.md` **+232 / −24** · `reference-manual.md` **+96 / −2**. The deletions are in-place corrections; **every superseded value is quoted in the text that replaced it.**

---

## 1. 🔴 THREE FIGURES IN THE BRIEF WERE WRONG, AND I RECORDED WHAT IS TRUE

The instruction was to fold in the batch. Three numbers in it did not survive verification, and the manuals carry the measured values, not the supplied ones.

| brief said | 🧪 actual | where |
|---|---|---|
| *"143 terms imported, **5** poison-flagged"* | **4** in the live table. The import **file** carries 5; `Off The Beaten Truck` is live with `hits_truck = null`. 🧪 All 143 share one `created_at`, so it was one import — **the SQL run was not the file on disk.** Cause **UNRESOLVED**, benign. | §17.1 |
| *"the membership rule at **`:625-628`**"* | **`:871-874`** (Sheet builder) and **`:940-942`** (DB builder). 🧪 `:625-628` is now alias-matching code — the pointer went stale when `MATCH_FROM` inserted ~214 lines above it. | §17.4 |
| *"a separate, older cohort of **23** zero-event rows from the 22 May migration"* | **27**. 🧪 123 rows created 2026-05-22, of which **27** have zero events. And **88 of 231** rows have no event at all — 55 September, 27 May, 6 others. | §18.4 |

⚠️ **This is the pass's own standing lesson landing on the pass itself:** a figure repeated into a brief is not more established than when it was first written. All three were re-derived rather than transcribed.

---

## 2. WHAT WAS WRITTEN — SCRAPER MANUAL V1.5

**New sections:**

- **§17 — where the migration actually stands.** §17.1 applied state (`venues` 559 → 814, 143 terms, backup 559) · **§17.2 Step 1 dissolved** · §17.3 why the import took postcodes.io only · **§17.4 the switch pattern as the durable artefact** · §17.5 why `MATCH_FROM` must not be flipped.
- **§18 — `excluded` governs visibility, not matching.** §18.1 the finding and how the re-run proved it read changed data · **§18.2 why `.eq('excluded', false)` is wrong** · §18.3 the three genuine defects · §18.4 the two cohorts.
- **§3.4 — Pass B no longer reads the Sheet**, plus the `venues.scraper_strategy` marker nulling and the Sheet's remaining 342.

**Rewritten in place:**

- **§11.2 OPEN → CLOSED.** The old text is **quoted** before the correction, so a reader meets what it used to say.
- **§16.1 trigger ownership downgraded** from **OPEN RISK** to a noted fact — ⚠️ recorded as **operator-confirmed and not verifiable from this repository**, with the silent-stop property and the UNKNOWN frequencies **explicitly preserved**.
- **§6 defect table:** row 13 closed; rows **18, 19, 20** added (`excluded`, the three defects, the 88 zero-event rows).

**Ten new UNREAD entries**, none resolved by omission: the right `excluded` predicate · the 93/97 reconciliation · the three matching defects · the 3 September provenance (**inferred, not established**) · the 27 May rows · the `Off The Beaten Truck` flag · **whether the repointed write lands** · the Sheet's 342 markers.

### The corrections carrying their old values

| corrected | old value, quoted in the manual |
|---|---|
| Step 1 of the migration | *"81 have a Sheet URL and a null `schedule_url` — the site list cannot be rebuilt from the DB today"* → 🧪 **26 schedule URLs, all already present; 80 were WEBSITES, all already present; `coalesce` reproduces 106/106** |
| §11.2 | *"🔴 STILL OPEN: `:784-790` … `validTrucks` is in scope and nothing consults it"* → ✅ **repointed, awaited, guarded** |
| §16.1 | *"owned by an account that is not the one viewing… OPEN RISK"* → ⚠️ **Dominic's own second account; silent-stop still holds** |
| V1.4's `:625-628` | stale pointer → **`:871-874` / `:940-942`** |

---

## 3. WHAT WAS WRITTEN — APP MANUAL V12.6

**§48 gained a new subsection**, and it leads with the correction rather than the change: **the belief that PostHog had been removed was false, and this manual already said so** at `:8506` and `:12716`. 🧪 `08ac368` stripped two event properties and disabled session recording; PostHog is installed, initialised at module scope, mounted in the root layout, and **in the served landing page**.

Then: ✅ the decision (**PostHog stays, Vercel Analytics not added**) · the two-layer scoping and 🔴 **why `before_send` is load-bearing rather than belt-and-braces** — global listeners answer to the library, not the React tree · ⚠️ the method note that **served HTML cannot prove absence** when a static import is involved · and three **STILL OPEN** items.

🔴 **The one that matters most is recorded as live, not historical:** `realthaifood-23f80551121b` is **unrotated and still the current token on an active account**, so a working bearer credential sits in a third-party store today. The manual says **rotate before deleting**, and notes that rotation invalidates the plaintext `/manage/<token>` links `inbound-schedule/route.ts:275` emails.

**Version strings checked against the manual's own standing rule** — 🧪 header `· V12.6` and front-matter `**Version 12.6**` agree; the rule exists because they once drifted three releases apart.

---

## 4. EVIDENCE — AND WHAT WOULD HAVE LOOKED THE SAME IF IT PROVED NOTHING

**This is a documentation pass; I did not re-run the batch's experiments. What I verified directly, this evening:**

| claim written | how checked | what a false positive would look like, and how it was ruled out |
|---|---|---|
| `venues` 814, backup 559, terms 143 | 🧪 PostgREST `count=exact`, service key | An RLS-limited role would under-count. Ruled out: the service key bypasses RLS, and these same calls tracked 559 → 814 across the import. |
| 4 poison flags, not 5 | 🧪 `hits_truck=not.is.null` **and** `grep -c` on the import file | If both were wrong the same way the discrepancy would vanish. Ruled out: they were read from **different sources** (live table vs file on disk) and **disagree**. |
| markers nulled 100 → 0 | 🧪 `scraper_strategy=like.*NEW FROM SCRAPER*` → 0 | A typo'd filter also returns 0. Ruled out: the same filter shape returned **100** before the fix and **7** for `scroll_lazy` now. |
| the membership rule moved | 🧪 `grep -n "hasUrl \|\| hasInstructions"` → `:874`; `sed -n '625,628p'` shows alias code | A grep that failed prints nothing. Ruled out: it printed **six numbered lines**, and the `sed` printed the wrong-but-real code at the old address. |
| 27 May zero-event rows | 🧪 paged all 4,300 `discovery_events`, joined on `discovery_truck_id` | A partial page would under-count events and **over**-count zero-event rows. Ruled out: the loop pages to exhaustion and the totals reconcile — 55 + 27 + 6 = 88 of 231. |
| the three graduated shadows | 🧪 `excluded=eq.true&hatchgrab_truck_id=not.is.null` → exactly 3 | A filter matching nothing also returns few. Ruled out: it returned the **three named trucks**, and 🔎 §7.3 documents the convention independently. |
| trigger ownership | ⚠️ **operator statement only** | 🔴 **Not ruled out — not verifiable from here.** Recorded as user-confirmed, and the silent-stop property is preserved unchanged. |

**Extensions searched:** none scoped. `grep -n` over `scripts/run-scraper.js` (**JavaScript**), `docs/*.md` and `supabase/migrations/*.sql` by path; every search's output is quoted above.

---

## 5. WHERE TWO SOURCES DISAGREED, AND WHAT I DID

1. **Brief vs live table on the poison count (5 vs 4).** ⚠️ Recorded **both**, with the file/table split named and the cause left **UNRESOLVED** — it is already an open item in `auto-exclusion-write-report.md` §6.
2. **Brief vs code on `:625-628`.** 🔎 Corrected to the measured lines, **with the reason the old pointer went stale** — so the next reader understands it was right once.
3. **Brief vs data on the May cohort (23 vs 27).** 🧪 Corrected, and the fuller figure (88 of 231 with no events) added, because the 27 alone understates it.
4. **V1.4 vs the operator on trigger ownership.** Downgraded as instructed — ⚠️ **but explicitly as an unverifiable operator statement**, with the risk that actually matters (silent stop, no monitor) left OPEN.

---

## 6. WHAT I DID NOT DO

- **No `git add`, in any form.** No commit, push, revert, checkout or stash. 🧪 `HEAD` identical before and after.
- **No database write** — every call was a `select` or a count. **No Sheet access at all** this pass.
- **No code file changed.** The three modified files in the tree (`app/providers.tsx`, `scripts/run-scraper.js`, `DEBUG_SCRAPED_TEXT.txt`) were not opened for editing.
- **No default flipped, no switch committed.** The manuals record all three as built-and-unflipped.
- **Nothing garbled, and no instruction contradicted another** — so nothing was stopped for.

---

## 7. THE STANDING LESSONS, NOW IN BOTH MANUALS

- 🔴 **A number repeated three times is not better established than when it was written once.** The audit's "write key", the "81 missing URLs" and the "348 venues" were each carried forward unchallenged and each was wrong. ⚠️ **Three more figures in this pass's own brief joined them.**
- 🔴 **Matching and visibility read different columns.** Hiding a row does not stop it being matched to — and the obvious fix would have stopped the trading truck being recognised.
- 🔴 **A forced disagreement against a noisy baseline proves nothing.** Equalise, then mutate one side.
- 🔴 **When a static import makes presence uninformative, prove the guard, not the absence.** *(app manual)*
