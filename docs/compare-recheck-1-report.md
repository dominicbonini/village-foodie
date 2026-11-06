# compare-recheck-1: the re-check is requested for tonight's run; the harness fix is done

*6 November 2026. No check has run yet. One request was written to the database (§2).*

## Status, 6 November 2026, 11:40 UTC: requested; the runs come tonight at 02:10 UTC; one decision before then

- **Your answer:** C. You pushed and deployed `main`.
- **GitHub's `main` matches this `main`:** both `60db835b` before this work's commits.
- **The 12 "Check now" requests are set** (§2), exactly as Admin's "Check now" sets them.
- **I cannot start the run myself:** the GitHub CLI (`gh`) is not installed here. So the requests wait for the **nightly scheduled run at 02:10 UTC on 7 November**. Its routine share takes requested competitors first.
- **Come back after about 09:00 UTC on 7 November.** The nightly job runs the quick pass, then the deep share, then the routine share, and may take several hours. I will then finish §3 and run the full sweep.
- **⚠️ The routine check will ask very little, and that needs your decision:**
  - A requested check is a routine check, and it asks only features that are **due**: never asked, or last asked more than 90 days ago (`lib/competitor-check/core.ts` dueFeatures).
  - **11 of the 12 had 39 to 64 features asked by the quick pass between 1 and 6 November,** so almost none are due. Hatches Up is the exception: it was never checked.
  - **Pages are recorded only for the features a check asks about.** So tonight would record pages for Hatches Up's features and very little else, and "Not listed" would barely move.

### The question (answer before 02:10 UTC tonight to catch the run)

```
compare-recheck-1 — the requested checks only ask features that are due, and for 11 of the 12 almost none are (asked 1–6 Nov).
Pick one:
  A  Leave it: tonight checks the 12 as requested; expect pages for Hatches Up and little else.
  B  Also make their shown core and commercial features due: one committed migration sets competitor_feature_checks.checked_on
     back 91 days for those 12 competitors and those features only (scheduling data, nothing else). Tonight's routine check then
     asks every one of them and records the pages. Same run and budget code; ~$0.9–1.6 (at most ~$3).   ← my recommendation
  C  You start Actions › Competitor check › Run workflow, mode "single" (a deep check), once per competitor — no data change,
     about $1.6, results within the hour.
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

**The request**, run as `supabase/migrations/20261076_compare_recheck_1.sql`. It is what Admin's "Check now" writes (`app/api/admin/competitor-check/route.ts`, action `check_now`), for exactly these 12:

```sql
update public.competitors c
   set check_requested_at = now()
  from public.comparison_entries e
 where e.competitor_id = c.id
   and (e.country_code, c.name) in (
     ('GB', 'Aphelios'), ('GB', 'Beat The Queue'), ('GB', 'Grafterr'), ('GB', 'Hatches Up'),
     ('US', 'Best Food Trucks (BFT)'), ('US', 'Food Truck ONE (Food Truck OS)'), ('US', 'Food Truck Pub'), ('US', 'Goodfynd'),
     ('DE', 'gastro25'), ('DE', 'GastroDok'), ('DE', 'FoxiFood'), ('DE', 'Jamezz'))
   and c.check_requested_at is null;
```

> db-migrate: supabase/migrations/20261076_compare_recheck_1.sql · sha256 186d9044de744582 · committed at 41a59770
> db-migrate: … applied — one transaction, no error

**Verified (read-only):** exactly 12 competitors have `check_requested_at` set, all active, and no other competitor does.

**How the request is used:**
- The field is per competitor; a routine check covers every country the competitor sells in. Jamezz, for example, also has the Netherlands.
- The checker clears the field after the check.
- Nothing becomes public: every finding waits for your review.

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
