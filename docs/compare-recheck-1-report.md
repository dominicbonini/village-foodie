# compare-recheck-1: the 12 shown competitors re-checked, and tidy-1 fixed

*7 November 2026. Nothing is deployed, and nothing is public: every finding waits for your review. Two migrations were run on 6 November: the request, and the features made due.*

## Summary

- **The checks ran** in the scheduled job on 7 November. GitHub started it at 08:42 UTC, not at 02:10. The routine stage (10:06–10:41 UTC) re-checked **11 of the 12**.
  - **Hatches Up was not checked.** It has no website and no check URLs, so there is nothing to read. Its request is still set.
- **Every feature made due was re-asked, and all those records now carry their pages.** No row was left on a moved date, so the restore had nothing to put back. Read-only check: 0 rows dated before September.
- **Results:**
  - **317** feature-check records now carry their pages;
  - **14 new "no" answers,** all with their quote and page;
  - **0 cells "Not listed", before and after;**
  - **"Which suits" answers in the admin view are unchanged:** GB 1, US 3, DE 2.
- **Why nothing changed on the pages yet:** the checker only proposes. **Every answer from this run is a finding waiting for you in Admin › Pricing check › Automatic checks.** No stored answer, plan or category has changed, and "Not listed" can only come from a stored "not mentioned" answer. None of the 12 has one yet.
- **⚠️ Reject before accepting (§4):** seven Best Food Trucks findings say "not mentioned" while their own quotes show the feature is offered. Two classification findings (gastro25, Grafterr: "restaurant ordering") would change who is shown.
- **Actual cost:** this check's share of the routine run is **≈ $0.43** (11 of its 15 checks, $0.5805 in all), against an estimate of $1.60.
- **Harness:** `tidy-1` 58/58. Full sweep: 199 / 200; the one failure (reviews-weather-1, a test that broke because the date passed) is fixed and passes (§6).

## 1 · Cost estimate (from 6 November)

- **Estimate:** 12 checks at the deep-check average of $0.13 each, so ≈ $1.56, and at most ≈ $3.12.
- **Help-centre reads:** stayed off.
- **What ran instead:** the requested routine check, for the features made due. That is cheaper per competitor.

## 2 · What was run

| Step | What | Result |
|---|---|---|
| `20261076` | "Check now" for the 12: `competitors.check_requested_at = now()`, exactly as Admin's button | 12 requested, all active |
| `20261077` | The 12's shown core and commercial features made due: their every-country check dates moved back 91 days. The originals are in the file's header | 246 rows. Guard: exactly 246, or roll back |
| Not done | Making the country-specific records of Best Food Trucks, Goodfynd and Jamezz due | No check that night would read them (§5) |
| Run `97e1fbf0` | The scheduled routine stage: requested competitors first, the same run, budget and time code | 15 checked (the 11 plus 4 that were due anyway), done, $0.5805 |
| Restore | Rows not re-checked go back by +91 days | **Not needed:** all 246 were re-checked |

- **Admin's choices are untouched:** `checked_by` / `scope_by`, pin / hide, `absence_means_no`, `never_competitor_strength`.
- **No verification was set,** and nothing became public.

## 3 · Results per country

**"Pages complete"** means the record shows the features page and the pricing page fetched, and the help centre either read or not found. That is what "Not listed" needs.

### GB (Aphelios, Beat The Queue, Grafterr; Hatches Up not checked)

| Competitor | Records with pages | Pages complete? | New "no" with quote | New "not mentioned" |
|---|---|---|---|---|
| Aphelios | 27 | **no:** a help centre is linked, but help reads are off | 4 (hardware, perorder, term, terminal) | 0 |
| Beat The Queue | 27 | **no:** its features and pricing pages were refused (`url_not_in_prior_context`: not linked from what it had read) | 0 | 0 |
| Grafterr | 27 | **no:** help centre linked | 0 | 0 |
| Hatches Up | 0 | not checked (no website) | — | — |

- **"Not listed" cells:** 0 before, 0 after.
- **"Which suits", admin view:** 1 before, 1 after. The text, unchanged:

> **What happens to online orders if my signal drops?**
> HatchGrab can pause online ordering automatically when the truck loses signal, so customers can’t place orders the kitchen won’t receive.

### US (Best Food Trucks, Food Truck ONE, Food Truck Pub, Goodfynd)

| Competitor | Records with pages | Pages complete? | New "no" with quote | New "not mentioned" |
|---|---|---|---|---|
| Best Food Trucks (BFT) | 39 | **no:** its homepage was refused (`url_not_allowed`) and its pricing and features pages were not reachable | 0 | 7: **see §4, wrong** |
| Food Truck ONE | 26 | **no:** only its homepage was read; no pricing page | 4 (hardware, perorder, setup, terminal) | 11 |
| Food Truck Pub | 26 | **no:** help centre linked | 3 (hardware, perorder, terminal) | 9 |
| Goodfynd | 26 | **yes**, on the every-country record. But its US record (22 features, from the quick pass, no pages) wins on the page (§5) | 0 | 15 |

- **"Not listed" cells:** 0 before, 0 after.
- **"Which suits", admin view:** 3 before, 3 after (the two price answers and the signal-drop answer).

### DE (gastro25, GastroDok, FoxiFood, Jamezz)

| Competitor | Records with pages | Pages complete? | New "no" with quote | New "not mentioned" |
|---|---|---|---|---|
| gastro25 | 27 | **yes** | 2 (setup, term) | 1 (perorder) |
| GastroDok | 27 | **yes** | 0 | 2 (term, trial) |
| FoxiFood | 27 | **no:** help centre linked | 1 (term) | 0 |
| Jamezz | 38 | **no:** its pricing page was refused (`url_not_in_prior_context`), and its DE record (39 features, no pages) wins on the page | 0 | 1 (whatsapp) |

- **"Not listed" cells:** 0 before, 0 after.
- **"Which suits", admin view:** 2 before, 2 after (collection times, and the signal drop).

**Once you accept the "not mentioned" findings, how many cells would become "Not listed"?**
- **Under today's rules: none.**
  - The competitors with complete pages are gastro25, GastroDok and Goodfynd.
  - gastro25's and GastroDok's "not mentioned" features are not absence-means-no features (term, trial), or come from the plan (perorder).
  - Goodfynd's US record wins (§5).
- **If the page used the newer record (§5),** Goodfynd's android, domain, ipad, social and whatsapp would read "not listed". **Read §4 first:** at least the apps look doubtful.

## 4 · Looks wrong: listed for you, nothing changed

1. **Best Food Trucks: seven findings say "not mentioned", but their own quotes show the feature.** Reject them, or accept them as "yes" by hand:
   - ahead: "pre-order their meals up to 60 days before the scheduled shift";
   - schedule: "If you have a weekly location you can click ‘recurring’";
   - discovery: "Food trucks map";
   - private: "Set up a regular food truck program or just a one time event";
   - cards and cardfee: "Card not present fees are standard at 2.9% + .30";
   - domain: no quote.

   Accepted as they are, "schedule" (an absence-means-no feature) could later read "not listed": a false inferred no. The model's outcome contradicts its quote. That is a checker weakness worth a fix of its own: treat a "not mentioned" that carries a quote as unusable.
2. **Goodfynd: 15 "not mentioned" findings, for android, ipad, notify, social, terminal, menuphoto, stock and others.**
   - The source shown for each is its pricing page, and the products pages it read include online ordering and POS.
   - For a platform that sells a POS and apps, "the website doesn't mention Android or iPad" is doubtful. Check its app-store presence before accepting.
3. **gastro25 and Grafterr: classification "restaurant ordering",** quoting "Online ordering system for restaurants, pizzerias and snack bars" and "An end-to-end hospitality management platform".
   - Accepting sets their focus to restaurant ordering, so their category becomes **restaurant**.
   - **gastro25 would leave DE's four** (DE has other food-truck tools). **Grafterr would leave GB's four.**
   - Decide it as a choice of who is shown. You can also pin either one.
4. **Food Truck ONE: "not mentioned" for preorder, ahead and kds.** Only its homepage was read, so its pages are incomplete and this can never become "not listed". It is still unlikely for a food-truck system: check it before accepting.
5. **Page records:**
   - some contain a failed entry with no URL (`invalid_tool_input`, the model's malformed fetch);
   - some `fetchedAt` times predate the check, because the fetch tool serves a cached copy and reports when that copy was taken.
   - Neither makes a record complete when it shouldn't be.
6. **Why most records are incomplete,** with two cheap fixes, neither applied:
   - **help centres linked but not read:** Aphelios, Grafterr, Food Truck Pub, FoxiFood, Jamezz and Best Food Trucks. Help reads are off; up to ~$6 a month, as compare-suits-1 §4.4;
   - **pricing or features pages the fetch tool refused** because they weren't in what it had already read: Beat The Queue, Jamezz and Best Food Trucks. **Adding each competitor's pricing and features page to its check URLs in Admin** would let the next check fetch them directly.
7. **Hatches Up** is in GB's four, but has no website. Add one in Admin, or hide it so the next GB tool takes its place.

## 5 · The country-record rule (flagged, not changed)

- **The rule:** the comparison page takes a country's own check record before the every-country one (`lib/comparison-features.ts` featureCheckOf).
- **The effect:** Best Food Trucks (US, 21 records), Goodfynd (US, 22) and Jamezz (DE, 39) have quick-pass country records without pages. Those win over this run's every-country records, which have pages.
- **Making those records due would not help:**
  - only the quick pass or a deep check for that country writes them;
  - the quick pass that started on 29 October already counts all three as done;
  - the deep check is on Czechia.
- **The fix is one line of page code,** for a later brief: take the newer of the two records.

## 6 · Harness fix

- **`scripts/tidy-1.cjs`** (`9dd99a48`): the dead-code check's allowed files now include partners-1's partner mail, which reads `outreach_messages.is_test`:
  - `app/api/admin/partners/…`;
  - `components/admin/PartnersTab.tsx`;
  - `lib/partner-mail-poll.ts`.
- **Its intent is unchanged:** no code reads a `trucks.is_test`.
- **Result:** 58/58.
- **Full sweep** (`node scripts/run-harnesses.cjs`, 200 listed): **199 of 200 passed.** The one failure was `reviews-weather-1`, which went off on the date: its route section read the real clock, and its fixture stop dated 6 November became "past" on 7 November. Nothing this work touches is involved, and it passed in the sweeps of 6 November. I pinned that section to the harness's own fixture instant (re-pinned, 3 lines, nothing else changed). It now passes alone, 79/79. I did not re-run the whole hour-long sweep for that one change.

## 7 · Files and commits

| Commit | What |
|---|---|
| `9dd99a48` | `scripts/tidy-1.cjs` |
| this commit | `scripts/reviews-weather-1.cjs` (section 11 runs at its fixture instant) |
| `41a59770` | `supabase/migrations/20261076_compare_recheck_1.sql` (run) |
| `98ab0a24` | `supabase/migrations/20261077_compare_recheck_1_due.sql` (run) |
| `60db835b`, `2bbe546e`, `82044fe9`, `98c10863`, and this one | `docs/compare-recheck-1-report.md` |

No page code changed. No `outreach_templates` row, truck, order or payment was touched, and no `.env*` file was opened.
