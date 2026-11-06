# compare-recheck-1: the re-check is not run yet; the harness fix is done

*6 November 2026. Nothing is deployed or pushed. No check has run, and nothing was written to the database.*

## Status: stopped before §2 (RUN), on one decision

- **Pre-check passed.** compare-suits-1 is on `main`, and no other session has uncommitted work in the repo.
- **§1 Cost: about $1.60, at most about $3.** That is under the $5 line, so nothing needs cutting (§1).
- **§4 Harness fix: done and committed** (`9dd99a48`). `tidy-1` now passes 58/58 (§3).
- **§2 Run: blocked.** Doing it "through the checker's normal path" contradicts "No deploy":
  - **The checker only runs on GitHub Actions** (`.github/workflows/competitor-check.yml`). Its Claude API login and database keys live there, and there is no local path.
  - **GitHub runs the code on GitHub's `main`.** That is `b5a43927`, 9 commits behind this `main`.
  - **The checker on GitHub's `main` records no pages.** That needs compare-suits-1's checker change (`9f3a7096`), which is only here.
  - **A run now would store "no" quotes** (that rule was already in force) **but no page records.** So no cell could become "Not listed", which is the point of the run.
  - **Getting the new checker onto GitHub means pushing `main`,** and pushing `main` deploys the site. It would also push partners-1's commits, which are another session's work.
- **I can't trigger a run from here:** the GitHub CLI (`gh`) is not installed on this Mac. The workflow is started from GitHub's Actions page, or by Admin's "Check now" plus the nightly run.

### The question

```
compare-recheck-1 — the checker runs on GitHub from GitHub's main, which is 9 commits behind (no page recording there).
Pick one:
  A  You push main (this deploys cwv-1, partners-1 and compare-suits-1 to production). Then run the 12 checks:
     either in Admin › Pricing check press "Check now" on each of the 12 (the nightly 02:10 UTC run picks them up),
     or in GitHub › Actions › Competitor check › Run workflow, mode "single", once per competitor (names below).
     I then write the report from what they recorded.                                          ← my recommendation
  B  Run the 12 checks now on GitHub's current code: quotes for "no"s fill in, but no pages are recorded,
     so "Not listed" stays at 0. A second run would be needed after the push anyway.
  C  Wait: do nothing until you have pushed; then tell me and I carry on from §2.
```

## 1 · Cost first

### The competitors the rule shows today

These are the four per country in the admin view. Nothing is pinned, hidden or verified, so food-truck tools come first, then the entry order.

| Country | The four |
|---|---|
| GB | Aphelios · Beat The Queue · Grafterr · Hatches Up |
| US | Best Food Trucks (BFT) · Food Truck ONE (Food Truck OS) · Food Truck Pub · Goodfynd |
| DE | gastro25 · GastroDok · FoxiFood · Jamezz |

### The features a check of these would ask about

These are the core and commercial features that are checked and shown in that country. The price rows come from the plans, not from answers.

- **Every country (core):**
  - ordering: preorder, capacity, ahead, schedule, walkup, stock, notify, menuphoto;
  - payments: cards;
  - kitchen: kds, tickets, offline, vans;
  - marketing: domain, whatsapp, social;
  - apps and hardware: ipad, android, hardware, terminal.
- **Every country (commercial):** term and trial, plus the plan's price, fees and card rate.
- **GB only:** discovery. **DE only:** paypal.
- **Secondary, on the same pages (no extra fetch):** delivery, and fiscal in DE.
- **Not asked about:** allergens, which is tier off and not checked.

### The estimate

The checker's own settings:
- extractor and verifier: Haiku 5.5 ($0.10 / $0.50 per million input / output tokens);
- deep check: 12 page fetches, 6 searches;
- help-centre reads: off.

| Basis | Per check | 12 checks |
|---|---|---|
| Deep checks over the last 30 days (81 checks, $10.50) | $0.13 average | **≈ $1.56** |
| Worst case (each at twice the average) | $0.26 | **≈ $3.12** |

- Both are under $5, and the daily cap of $8 holds either way.
- **Checking the same 12 by the quick pass instead** would cost about $0.10 in total. It reads only 3 pages per call, so it records fewer answers.

## 2 · Run

Not done; see the question. Nothing was written: no check request, no run, no finding.

**When it runs, the normal path stays as it is:**
- the same run, queue, budget caps and time limits as a scheduled check;
- Admin's choices untouched: `checked_by` / `scope_by`, pin / hide, the two feature flags;
- every finding waits for your review, so nothing becomes public.

## 3 · The harness fix (`scripts/tidy-1.cjs`)

- **The cause:** partners-1's partner mail reads and writes `outreach_messages.is_test` (the same column), in four files the check did not list:
  - `app/api/admin/partners/route.ts`;
  - `app/api/admin/partners/mail-send/route.ts`;
  - `components/admin/PartnersTab.tsx`;
  - `lib/partner-mail-poll.ts`.
- **The fix:** the allowed-file pattern now also includes `partners/`, `PartnersTab` and `partner-mail-poll`. The check's intent is unchanged: no code reads a `trucks.is_test`. I re-checked that no file mentions trucks within 80 characters of `is_test`. Nothing else in the harness changed.
- **Result:** `tidy-1` **58 passed, 0 failed**.
  - It was the only failure in compare-suits-1's last full sweep (198 of 199).
  - I have not re-run the full sweep for this one-line pattern change. It will run with §2.

## 4 · Still to do once you choose

- run the 12 checks;
- then report per country:
  - features with recorded pages;
  - "no" answers with quotes;
  - "Not listed" cells;
  - "Which suits" answers in the admin view, before and after (GB before: 1, the signal-drop answer; US: 3; DE: 2), with GB's text;
  - anything that looks wrong;
  - the actual cost;
- the full sweep;
- commit.
