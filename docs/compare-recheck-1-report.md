# compare-recheck-1: the re-check is requested for tonight's run; the harness fix is done

*6 November 2026. No check has run yet. One request was written to the database (§2).*

## Status, 6 November 2026, ~12:00 UTC: everything is set for tonight's run (02:10 UTC, 7 November)

- **Your answers:** C (you pushed and deployed `main`), then B.
- **GitHub's `main` matched this `main`** (`60db835b`) before this work's commits.
- **The 12 "Check now" requests are set** (`20261076`).
- **Their shown core and commercial features are made due** (`20261077`, below). The original dates are recorded in the file.
- **`gh` is not installed here,** so the run is tonight's scheduled one.
- **Come back after 09:00 UTC on 7 November.** I will then:
  - read what the run recorded;
  - **put back the original date of every row it did not re-check** (`checked_on + 91`, exact), so no stale date remains;
  - complete §3 and run the full sweep.

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

**Making the features due**, run as `supabase/migrations/20261077_compare_recheck_1_due.sql` (Dominic's B):

```sql
do $$
declare n integer;
begin
  with pairs(cc, name) as (values
         ('GB', 'Aphelios'), ('GB', 'Beat The Queue'), ('GB', 'Grafterr'), ('GB', 'Hatches Up'),
         ('US', 'Best Food Trucks (BFT)'), ('US', 'Food Truck ONE (Food Truck OS)'), ('US', 'Food Truck Pub'), ('US', 'Goodfynd'),
         ('DE', 'gastro25'), ('DE', 'GastroDok'), ('DE', 'FoxiFood'), ('DE', 'Jamezz')),
       scope as (
         select c.id as competitor_id, f.key as feature_key
           from pairs p
           join public.competitors c on c.name = p.name
           join public.comparison_features f on f.tier in ('core', 'commercial')
            and (f.show_scope = 'all' or (f.show_scope = 'some' and p.cc = any(f.show_countries))))
  update public.competitor_feature_checks k
     set checked_on = k.checked_on - 91
    from scope s
   where k.competitor_id = s.competitor_id and k.feature_key = s.feature_key and k.country_code = '';
  get diagnostics n = row_count;
  if n <> 246 then raise exception 'compare-recheck-1: expected 246 rows, the update would touch %', n; end if;
end $$;
```

> db-migrate: supabase/migrations/20261077_compare_recheck_1_due.sql · sha256 05075495adc09361 · committed at 98ab0a24
> db-migrate: … applied — one transaction, no error

**Scope:**
- the every-country check records (`country_code ''`, the ones a routine check reads to decide what is due);
- for the 12 competitors only;
- for the features shown on their country's page, with tier core or commercial only;
- nothing else: not `rejudge`, not `pages_checked`, no other row.

**The original dates** (all 246, in the migration's header):

| Competitor | Original date | Rows |
|---|---|---|
| Aphelios, Beat The Queue, Grafterr | 2026-11-04 | 27 each |
| FoxiFood, gastro25, GastroDok | 2026-11-05 | 27 each |
| Food Truck ONE | 2026-11-04 × 25, plus domain 2026-10-23 | 26 |
| Food Truck Pub | 2026-11-04 × 24, plus domain and preorder 2026-10-23 | 26 |
| Goodfynd | 2026-11-06 × 25, plus preorder 2026-10-23 | 26 |
| Best Food Trucks (BFT) | domain and preorder 2026-10-23 | 2 |
| Jamezz | domain, kds, preorder, whatsapp 2026-10-24 | 4 |
| Hatches Up | none: never checked | 0 |

**Verified (read-only):**
- exactly 246 rows moved, now dated 2026-07-24 to 2026-08-07, so all are due;
- 0 country-specific rows moved, and 0 rows of any other competitor;
- no other row in the table is dated before September, so tomorrow's restore (`checked_on < '2026-09-01'`, `+ 91`) can only touch these rows.

**Flagged for the morning, not changed:**
- Best Food Trucks, Goodfynd and Jamezz also have country-specific check records (US, DE, NL) from the quick pass, without pages.
- The comparison page prefers a country's own record over the every-country one (`lib/comparison-features.ts` featureCheckOf). So their cells may still read "not mentioned" after tonight's every-country check, even with pages recorded.
- Changing that rule is page code, which this brief rules out. I will report how many cells it affects.

**Not applied: making the three competitors' country-specific records due** (asked on 6 November, after `20261077`).
- **Estimated extra cost: $0,** because no check tonight would read those records:
  - the requested routine check covers every country and reads and writes only the every-country records;
  - a country-specific record is written only by the quick pass or a deep check for that country;
  - the quick pass started on 29 October tracks progress per competitor and country (`pass_state.done`) and already counts Best Food Trucks (US), Goodfynd (US) and Jamezz (DE) as done;
  - the deep check is on CZ (`deep_country`).
- **So the migration would change nothing,** and its rows would only be moved and moved back. I did not write it.
- **Two ways to fix these three:**
  - let the page use the newer of the country's own and the every-country record. That is a page-code change, for a later brief;
  - a deep "single" check for each of the three, about $0.40, started from GitHub Actions.

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
