# competitor-wtt-1: What The Truck added to the competitor database

*4 November 2026. Committed on `main` (`33ab38bc`; this report in the next commit); not pushed and not deployed. **No migration**: nothing schema-related was needed, and no row has been written yet. What The Truck arrives the way the German research did: in a data file that the automatic importer writes on the first competitor-check run after the push (35.an-9). Everything arrives **UNVERIFIED** (35.an-1). No public page changes: GB comparison is `off`, and the file adds no comparison entry.*

| # | Item | Outcome |
|---|---|---|
| 1 | Check first | **Not there.** Read-only, no competitor matches the name (`%what%truck%`) or the domain (`whatthetruck`). It will be **added**, not updated. If a matching row appears before the import, the importer still matches it by id, then name, then domain, and updates it (proven in §6). |
| 2 | The competitor | **In the file:** "What The Truck", `https://whatthetruck.ai`, focus `food_truck`, active. The company is in its note. Its country (GB) comes from its plan; `competitors` has no country column. |
| 3 | The plan | **In the file:** one GB plan, £0 a month, online fee 3.95% (the first tier, which every new account starts on), VAT excluded. Every tier, Founder 100, hardware, card processing (NOT STATED) and the contract are in its note. |
| 4 | Feature answers | **42 answers**, one for each checked feature. **25 carry a verbatim quote, all found in the fetched pages.** 17 are `not_mentioned`, and none is `no`. Your reading is confirmed, apart from the points flagged in §3. |
| 5 | Their extra capabilities | Listed in §5, each with its quote. No features were added. |
| 6 | Deep check queued | **In the file** as `request_check: true`. The import sets `check_requested_at`, the same column Admin's "Check now" sets. ⚠️ Whether that becomes a *deep* check depends on when you push (§4). |
| 7 | Proof | `scripts/competitor-wtt-1.cjs` (registered): **42 passed, 0 failed**. `tsc` and `eslint` are clean. Full sweep: 186 of 188 passed on the first run. **competitor-check-1** failed because of this change and is re-pinned (now 227 / 227). **faq-1** fails the same way at HEAD, so this change didn't cause it (§7). |

## 1 · Flags (read these first)

1. ⚠️ **`docs/import-and-cs-fix-report.md` does not exist.** The brief asked me to read it. No file under `docs/`, and nothing in git history, has that name or "cs-fix" in it. The nearest are `import-review-report.md`, `hatches-up-import-report.md` and `outreach-mail-import-view-report.md`; I read none of them in its place. If the name was garbled, tell me which file you meant.
2. ⚠️ **Nothing is in the database until you push.** The importer runs as the first step of `.github/workflows/competitor-check.yml`, from GitHub's `main`. "Commit, no push" therefore means the file waits. I did not run the importer by hand. Running it from this Mac would write production rows from unpushed code, which is not what "its automatic importer" says.
3. ⚠️ **The timing of the deep check.** The GB deep check is running: `deep_country = 'GB'`, requested 3 Nov 13:20 UTC, 15 a day. A read-only count (an estimate, from current GB plans) shows **about 4 of 15 GB competitors still pending**. That means GB will likely finish on the next nightly run, and the queue will move on to DE.
   - **Push before the next nightly run:** the import runs first, What The Truck is in GB with no deep check and a "Check now" request, so the GB deep share takes it **first** (§6, `deepTargets`). That is a **deep** check: every finding gets a second check.
   - **Push after GB has finished:** the queue never goes back to GB, so the request gives a **routine** check instead. Because nothing has been asked yet, it still asks all 42 features. Each quote is still checked by code (35.an-4), but only the *changed* answers get a second check. To get a true deep check then, use Admin's "Start deep check" for GB (all 15 again), or run a `single` check by hand. You said not to run it by hand, so I haven't.
4. **Card processing: I kept it NOT STATED, as you said, because the site contradicts itself.**
   - /pricing says "card processing is on us" and "the card fees are on us" (Founder 100 month only).
   - The FAQ says "WhatTheTruck! earns when you earn, through a payment processing fee on your sales". That reads as if the fee includes the card processing (`bundled`).
   - /terms says "Card payments, online and at the counter, are handled by third party payment providers that you connect to your account … Their fees are set by them." That reads as separate.
   - So `card_mode = 'unknown'` with no card rate, `unclear = true`, and `cardfee` is `unknown` with that reason.
5. **The term is `unknown` with the note "none stated: close the account at any time by email", not `no`.** A `no` needs a quote with a negation (35.ao-7). The only quote is "You can stop using the platform and ask us to close your account at any time by writing to", which has none. This is also how the 7 existing DE term answers are stored (`unknown` + a note). On a comparison page the cell would read "Not stated" with that note.
6. **The set-up fee is stored as 0 on the plan, though the site doesn't state one.** `competitor_plans.setup_minor` is NOT NULL (default 0). The comparison builds the set-up cell from the plan, so once verified it would read **No**. The `setup` answer itself is `not_mentioned`. This matters only when you verify the plan and GB goes live.
7. **`ipad`: partial, per the site. The App Store suggests yes.** The site names the iPad only for the kiosk. Apple's lookup for id 6805236905: **GB 1 result** ("WhatTheTruck!", seller WHAT THE TRUCK SOFTWARE LTD, iPad supported, **9 iPad screenshots**), **US 0**. So the operator app very likely runs on an iPad. The checker may read app stores, so the deep check can propose `yes` with its own quote.
8. **`android`: yes, but the quote is the badge's image text.** "Get it on Google Play" is the `alt` of the Google Play badge on /app (and /, /support). It links to `ai.whatthetruck.ops`, and the Play page answered 200 with "WhatTheTruck!". The word "Android" is not in any page's visible text.
9. **Two `yes` answers are wider than our labels.**
   - **cards:** our label says "incl. Apple Pay and Google Pay", and neither is named. The note says so.
   - **social:** our label is "posts from your schedule", and their posts are AI-made, not said to come from a schedule.
   - Each has a note. You may prefer `partial` for both when you verify.
10. **Answers outside your reading** (the brief listed 35 keys; the checked list has 42):
    - `staff` is **yes**. /terms: "including by the staff you add to it, so remove people who should no longer have access". /rocky adds that "Rocky checks each person's role".
    - `paymethods` is **unknown** with the note "online: card (methods not named); at the hatch: card reader or cash", which is the convention for this text feature.
    - `asap`, `ahead`, `localpay`, `paypal`, `fiscal` and `setup` are **not_mentioned**. For `ahead` the note says there is a page per gig, but ordering on an earlier day is not stated.
    - `monthly` (£0) and `perorder` (the tiers) are **yes** with quotes.
    - The four OFF features (allergens, deals, qr, buzzers) get no answer; the checker never asks them.
11. **The plan's name is mine:** "No monthly fee (fee per payment)". The site names no plan.
12. **The plan stores only the online first tier** (`truck_fee_bps = 395`, VAT `excl`). The in-person tiers, the other online tiers, proof of turnover and Founder 100 are in the plan's note. The table has one fee per plan, and the comparison is about online orders.
13. **I also gave the competitor `check_urls`: the ten pages read.** The checker starts from them instead of only the home page. It is an existing column (`text[]`) that Admin can edit.
14. **The brief's two closing instructions pull slightly apart.** Item 7 wants SQL and a table in chat; "FINALLY" wants only a two-line summary. As before (SQL blocks allowed beside the two-line summary), the chat has two lines of prose, the SQL blocks and the table, and nothing else.

## 2 · What will be written (on the first run after the push)

**File:** `data/competitor-wtt-1/competitors.json`, registered last in `DATA_FILES` as "What The Truck research", kind `research`.

**The competitor** (one new row):

| Column | Value |
|---|---|
| name | What The Truck |
| website | https://whatthetruck.ai |
| focus | food_truck |
| lifecycle | active (`added_as_candidate` false) |
| notes | What The Truck Software Ltd (company no. 17365285, registered in England and Wales; registered office in Harrow). Country: GB. |
| check_urls | /, /pricing, /compare, /features/festivals, /features/rocky, /features/loyalty, /features/paperwork, /app, /support, /terms |
| check_requested_at | the import's time (from `request_check: true`) |
| features_checked_on / features_verified_at | 2026-11-04 / null |

The company facts come from /support: "What The Truck Software Ltd, registered in England and Wales no. 17365285. Registered office: 1 Warner House Harrovian Business Village, Bessborough Road, Harrow, United Kingdom, HA1 3EX."

**The plan** (one `competitor_plans` row):

| Column | Value |
|---|---|
| country / currency | GB / GBP |
| plan_name | No monthly fee (fee per payment) |
| monthly_minor / setup_minor | 0 / 0 (setup not stated: flag 6) |
| truck_fee_bps | **395** (online, first tier; a new account's rate) |
| customer fee | 0 / 0 |
| card_mode / card_bps | unknown / null (NOT STATED) |
| vat | excl ("*Online rates are shown before VAT on the platform fee. The platform fee for online ordering is subject to VAT at 20%.") |
| status / unclear | counted / true |
| source / source_url / checked_on | research / https://whatthetruck.ai/pricing / 2026-11-04 |
| verified_at | null |

The plan's note: "One plan: no monthly fee; a fee on each payment, by yearly sales in each channel. In person (at the hatch): 1.25% up to £75,000; 0.95% £75,001–£150,000; 0.85% £150,001–£250,000; 0.80% over £250,000. Online (pre-orders): 3.95% / 3.75% / 3.50% / 3.25% on the same bands, before VAT at 20% on the platform fee. New accounts start on the first (top) tier; a lower tier needs proof of turnover. truck_fee_bps holds the online first tier (395). Offer "Founder 100": the first 100 trucks pay no fees in their first month (card processing on WhatTheTruck!; UK personal cards). Hardware (card readers, kiosk iPad) is bought separately; no prices given. Card processing included or separate: NOT STATED (…). Set-up fee: not stated (stored as 0, the column cannot be empty). Contract: none stated; close the account at any time by email (/terms)."

**No comparison entry.** GB comparison stays `off`, and nothing is verified.

## 3 · The 42 feature answers

Each is a `competitor_feature_values` row for every country (`country_code` null), unverified, dated 2026-11-04. Each quote was checked against the page it cites, after the checker's normalisation (case, whitespace, quote marks, dashes): **25 of 25 found**. 24 are in the visible text; `android`'s is the badge's `alt` text (flag 8).

| Key | Value | Verbatim quote (page) | Note |
|---|---|---|---|
| preorder | yes | "Customers order and pay from your page on their phone, and pick a time to collect." (/features/festivals) | |
| capacity | yes | "Online pre-orders and walk-ups land on the same cook sheet and share the same per-slot limits, so the hatch never gets swamped." (/features/festivals) | per-slot limits you set; walk-ups count against them |
| asap | not_mentioned | | |
| ahead | not_mentioned | | a page per gig with collection slots; ordering on an earlier day is not stated |
| schedule | yes | "Set up recurring gigs once, whether weekly, monthly or the 2nd Friday of the month, and keep the full gig workflow." (/compare) | recurring gigs |
| walkup | yes | "Walk-ups and online pre-orders land in the same queue." (/) | |
| stock | yes | "Mark an item sold out for this gig and it comes off the online menu and the till together." (/features/festivals) | sold out per gig; live stock updates and stock forecasts too |
| notify | not_mentioned | | |
| menuphoto | not_mentioned | | |
| options | yes | "Customers browse the menu, add extras, pick a collection slot and pay, even on festival 2G." (/) | |
| private | partial | "Corporate customers order online, and WhatTheTruck! totals the orders and generates the invoice." (/compare) | corporate gigs with invoicing; booking requests not stated |
| cards | yes | "Your first month after you sign up, the card fees are on us, at the hatch and online." (/pricing) | online card payments; Apple Pay and Google Pay are not named |
| payattruck | not_mentioned | | |
| localpay | not_mentioned | | |
| paypal | not_mentioned | | |
| custfee | not_mentioned | | |
| tips | not_mentioned | | |
| paymethods | unknown | "take walk-up orders, by card with a card reader or in cash" (/) | online: card (methods not named); at the hatch: card reader or cash |
| kds | yes | "Live kitchen queue: every order, on its own clock" (/app) | |
| tickets | yes | "print kitchen tickets and receipts" (/) | |
| offline | yes | "The app keeps taking walk-up orders offline and syncs them when the signal returns." (/support) | walk-up orders in the app |
| vans | not_mentioned | | |
| staff | yes | "including by the staff you add to it, so remove people who should no longer have access" (/terms) | staff added to the account; Rocky checks each person's role |
| reports | yes | "Revenue, COGS and profit per gig and per channel, plus repeat-customer and benchmark analytics, and CSV for the accountant." (/) | |
| domain | not_mentioned | | |
| whatsapp | not_mentioned | | |
| social | yes | "Create AI images and posts, and WhatTheTruck! shares them across your social channels." (/compare) | AI images and posts; not said to be made from the schedule |
| igmsg | not_mentioned | | |
| discovery | not_mentioned | | |
| loyalty | yes | "They earn stamps or points towards a reward you choose." (/) | |
| ipad | partial | "run a self-order kiosk on an iPad" (/) | iPad named for the self-order kiosk only; the operator app is "for food truck operators and their teams" (/app) |
| android | yes | "Get it on Google Play" (/app, badge `alt`) | the Google Play badge on /app (image text), linking to the operator app ai.whatthetruck.ops |
| hardware | partial | "Card readers and other hardware are bought separately." (/pricing) | sold separately; no prices given |
| terminal | partial | "Card readers are bought separately." (/) | sold separately; no prices given |
| fiscal | not_mentioned | | |
| delivery | not_mentioned | | |
| monthly | yes | "WhatTheTruck! costs nothing a month." (/pricing) | £0 a month |
| perorder | yes | "New accounts start at 1.25% in person and 3.95% online." (/pricing) | online 3.95 / 3.75 / 3.50 / 3.25% by yearly online sales (to £75k / £150k / £250k / above), plus VAT at 20% on the platform fee; in person 1.25 / 0.95 / 0.85 / 0.80%; a lower tier needs proof of turnover |
| cardfee | unknown | "Their fees are set by them." (/terms) | not stated: the terms say card payments go through providers you connect, whose fees are set by them; the pricing page says card fees are on us in the Founder 100 month |
| term | unknown | "You can stop using the platform and ask us to close your account at any time by writing to" (/terms) | none stated: close the account at any time by email |
| setup | not_mentioned | | |
| trial | partial | "For your first month after you sign up, we charge no fees on payments you take through WhatTheTruck!" (/pricing) | Founder 100 only (the first 100 trucks to join); there is no monthly fee anyway |

**Totals:** 17 yes, 5 partial, 17 not_mentioned, 3 unknown, 0 no.

**Against your reading:**
- **Confirmed with quotes:** all 14 of your yes answers, all 5 partial answers and all 11 not_mentioned answers.
- **Prices:** monthly £0 (yes), perorder (yes, the tiers), cardfee not stated (unknown), term none (unknown + note, flag 5), setup not stated (not_mentioned).
- **Nothing in your reading lacked a quote.**

**How the pages were read** (35.an-8): the ten pages, one request at a time with 3-second pauses, all HTTP 200. Then two app-store lookups (Apple GB and US, and Google Play GB), also one at a time. The page text was taken from the HTML with scripts and styles removed.

## 4 · How the check is queued

- The file's `request_check: true` makes the importer set **`check_requested_at`** to the time of the import. That is exactly what Admin's "Check now" writes (`app/api/admin/competitor-check/route.ts`, `check_now`). No new mechanism exists, and the checker code is unchanged.
- **What the checker does with it** (code, unchanged):
  - In a scheduled run, the deep share runs while `deep_country` is set. `deepTargets` takes the current country's pending competitors, "Check now" requests first.
  - What The Truck is in GB through its plan, and has never been deep-checked, so it is pending in GB.
  - After the check, `afterCheck` clears `check_requested_at`.
- **If GB has already finished** (flag 3): `selectRoutine` takes the request ahead of the quota as a routine check. Every feature is due, because none has been asked yet.
- **The checker reads `check_urls`** (the ten pages) and the stored answers. It compares its own quoted findings with them, and they go to Admin › Pricing check › Automatic checks for you to accept or reject (35.an-3).

## 5 · What they have that our feature list doesn't (report only; no features added)

| Capability | Their words (page) |
|---|---|
| EPOS / card taking at the hatch | "The app is your EPOS at the hatch: take walk-up orders, by card with a card reader or in cash" (/) |
| Self-order kiosk | "Let the queue order and pay at an iPad by the hatch. No extra software fee, hardware cost only." (/, /features/festivals) |
| Recipe costing and profit per gig | "Build menus, track recipe costs and margins, and adjust prices instantly to suit each gig." (/) · "A breakdown after every gig of what you actually made once your costs come off." (/compare) |
| Certificate storage, expiry reminders, packs for organisers | "Every document with an expiry or review date gets reminders four weeks before, a week before and on the day, then weekly until it's renewed." · "Email a pack or share a link. The organiser gets a page with your branding and a Download all button." (/features/paperwork) |
| Google review requests | "Send customers a direct Google review link after they order." (/compare) |
| Birthday and win-back messages | "Birthday messages, event anniversaries and Google review requests, each one editable and switched on or off." · "Email campaigns and voucher codes for the customers you choose, such as people who haven't been back for a while." (/features/loyalty) |
| Corporate invoicing | "Corporate customers order online, and WhatTheTruck! totals the orders and generates the invoice." (/compare) |
| Pitch mobile-coverage check | "See UK mobile-network coverage for the pitch's postcode, network by network, before you book it." (/features/festivals) |
| AI assistant (Rocky) | "Rocky is the AI assistant built into the WhatTheTruck! app. You type or talk to it in plain English" (/features/rocky) |
| Dynamic pricing | "Change every menu price at the touch of a button to stay competitive." (/compare) |

**Also seen, not in your list:**
- forecasts of sales and stock "with the weather factored in";
- "Van stock lists and weekly stock order sheets";
- staff holidays and vehicle dates (MOT, gas, PAT) in the diary, with reminders;
- AI reading of uploaded certificates;
- "21 themes" for the storefront;
- "Free next-business-day payouts";
- weather at the pitch.

**Their /compare page** compares them with Grafterr, Hatches Up and Square ("Information correct as of October 2026"). HatchGrab is not named.

## 6 · The code

**`lib/data-import/research.ts`** (the research importer). A competitor row may now carry two instruction keys. Neither is a column, and both are stripped before the insert.
- **`answers`:** `[{ key, value, note?, quote?, source_url? }]`. Before anything is written, it is checked by the checker's own rules:
  - yes / partial / no need a quote (35.an-4);
  - `no` needs a quote with a negation, via `saysNotOffered` (35.ao-7);
  - `not_mentioned` carries no quote;
  - `unknown` needs its reason in the note;
  - the key must be in the feature list in the database; a doubled key is refused;
  - a quote needs its `source_url`;
  - a quote is at most `QUOTE_MAX` (200) characters, a note at most 300.
  - A bad answer refuses the whole file, which writes nothing and names the row (35.an-10).
  - Answers are written like the legacy columns: only where the competitor has no current answer that says something, and a placeholder is superseded. An answer wins over the same feature's legacy column in the same row.
- **`request_check: true`:** sets `check_requested_at` on the new or matched row.
- **Counts:** the import's counts gain `checksRequested`; `answersAdded` already existed.

**`lib/data-import/importer.ts`:**
- registers `data/competitor-wtt-1/competitors.json` (appended last, so the existing indexes are unchanged);
- passes the database's feature keys and the import time to a research import;
- Admin's import line adds "N feature answers, unverified; N checks requested" when a file has them. The German line is unchanged (proven).

**Not changed:** the checker, the comparison pages, Admin, the database schema.

## 7 · Proof

**`scripts/competitor-wtt-1.cjs`** (registered in `scripts/harnesses.json`): **42 passed, 0 failed**. No network, no database, no Claude API.

1. **The data file:**
   - importable against the feature list;
   - the competitor, its company note and its check request;
   - the plan's figures and note;
   - no entry, nothing verified;
   - 42 answers = exactly the checked features, value by value as in §3;
   - every yes / partial quoted on whatthetruck.ai; no `no`.
2. **The importer:**
   - 1 competitor, 1 plan, 42 answers (value, note, quote, page) and 1 check request;
   - the instruction keys are not columns;
   - a rerun is a no-op by sha256, and a second run by hand writes nothing.
3. **A matching row (by domain):**
   - updated, not duplicated;
   - a placeholder superseded, an answer that says something kept, the plan attached.
4. **The rules:**
   - a `no` without a negation, yes/partial without a quote, not_mentioned with a quote, unknown without a reason, an unknown key, a doubled key, a bad value, a quote without a page, no feature list and a bad `request_check` are each refused;
   - a refused file records an error and writes nothing else.
5. **The registry, Admin's lines and the deep check:**
   - the registry order and Admin's lines (German line unchanged);
   - GB's deep check takes What The Truck first;
   - no migration.

**Other checks:**
- `npx tsc --noEmit -p .` exit 0.
- `eslint` on the changed files: exit 0.
- **Full sweep** (`node scripts/run-harnesses.cjs`): 188 registered harnesses, including the new one.
  - **First run: 186 passed, 2 failed.**
  - **competitor-check-1** (226 / 1) failed because of this change. Its pinned Admin line for a *fixture* German import now ends "…; 49 feature answers, unverified". That fixture writes 49 answers from legacy columns; the real 30 Oct import wrote 0, so the live line is unchanged. It is re-pinned (⚠️ RE-PINNED competitor-wtt-1) and now passes **227 / 227**.
  - **faq-1** (204 / 1), "only 20261058 … 20261064 follow it": **it fails the same way at HEAD** (run with this change stashed: 204 / 1). This change didn't cause it. brand-kit-1's migration 20261065 is missing from faq-1's list. I left it alone (outside this brief); it needs a one-line re-pin, which I can do on request.
  - **Not mine, not committed:** an untracked `docs/paperwork-1/paperwork-mockup.png` (created 15:19 today) appeared during the work. I left it untouched.

## 8 · SQL (all read-only; no migration was run)

**Before (step 1):**

```sql
select id, name, website, lifecycle, focus, notes, check_requested_at, deep_checked_at
from competitors
where name ilike '%what%truck%' or website ilike '%whatthetruck%' or name ilike '%wtt%';
```

Result: `[]` (no row).

**The deep check's state:**

```sql
select paused, deep_country, deep_requested_at, deep_per_day, deep_queue[1:5] q, tier_intervals from competitor_check_settings;
```

Result: paused false · deep_country **GB** · deep_requested_at 2026-11-03 13:20:11 UTC · 15 a day · queue GB, DE, CZ, AT, CH · tiers core 90 / secondary 180 / commercial 90.

GB's pending competitors (an estimate from current GB plans): **total 15, pending 4**, none requested; the last deep run started 2026-11-04 09:39 UTC.

**Verify (after the change, before any push):**

```sql
select
  (select count(*) from competitors where name ilike '%what%truck%' or website ilike '%whatthetruck%') as wtt_competitors,
  (select count(*) from data_imports where file_path = 'data/competitor-wtt-1/competitors.json') as wtt_imports,
  (select comparison_status from country_settings where country_code = 'GB') as gb_comparison_status,
  (select count(*) from comparison_entries where country_code = 'GB') as gb_entries,
  (select deep_country from competitor_check_settings) as deep_country,
  (select count(*) from competitors where check_requested_at is not null) as checks_requested_now;
```

| wtt_competitors | wtt_imports | gb_comparison_status | gb_entries | deep_country | checks_requested_now |
|---|---|---|---|---|---|
| 0 | 0 | off | 0 | GB | 0 |

**Run after the push and the next competitor-check run (read-only):**

```sql
select c.id, c.name, c.lifecycle, c.focus, c.check_requested_at, c.deep_checked_at, c.features_verified_at,
  (select count(*) from competitor_feature_values v where v.competitor_id = c.id and v.superseded_at is null) as answers,
  (select count(*) from competitor_feature_values v where v.competitor_id = c.id and v.superseded_at is null and v.quote is not null) as quoted,
  (select string_agg(p.country_code || ' ' || p.plan_name || ' ' || p.monthly_minor || '/' || p.truck_fee_bps, '; ') from competitor_plans p where p.competitor_id = c.id and p.superseded_at is null) as plans,
  (select result || ' ' || counts::text from data_imports d where d.file_path = 'data/competitor-wtt-1/competitors.json' order by imported_at desc limit 1) as import
from competitors c where c.website ilike '%whatthetruck%';
```

Expected:
- one row, active, food_truck, unverified;
- 42 answers, 25 quoted;
- the plan "GB No monthly fee (fee per payment) 0/395";
- the import `ok` with `added 1, plansAdded 1, answersAdded 42, checksRequested 1`;
- `check_requested_at` set until the check runs, then `deep_checked_at` set (or `last_checked_at`, if it was a routine check: flag 3).

## 9 · Undo (only if Dominic asks)

**Before the push:** revert the code commit. Nothing reached the database.

**After the import has run:**
- Removing the rows needs a committed migration run with `scripts/db-migrate.cjs` (35.ao-5), never ad-hoc SQL.
- Delete the file from `DATA_FILES` in the same change, or the next run imports it again.

⛔ DO NOT RUN — for a migration file only, and only if Dominic asks:

```sql
begin;
delete from competitor_check_findings where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93';
delete from competitor_feature_checks where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93';
delete from competitor_feature_values where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93';
delete from competitor_plans where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93';
delete from competitors where id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93';
commit;
```

**Two caveats:**
- If the row matched an existing competitor instead, its id is the existing one; check it first.
- `competitor_check_findings` and `competitor_feature_checks` exist only once the checker has run on it. If either table's foreign key cascades, its line is a no-op.
