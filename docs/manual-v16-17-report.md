# manual-v16-17: the reference manual brought up to date (now V16.18)

*12 November 2026. Only `docs/reference-manual.md` and this report changed. No code, database, migration or other file was touched, and
nothing was pushed or deployed. No `.env*` file was opened. The only database access was read-only, and none was needed for this brief.*

## Summary

- **`docs/reference-manual.md` is at V16.18:** the header, the front matter and a dated changelog block (12 November 2026).
  `grep -nE "V16\.18|Version 16\.18"` shows the header (line 1) and the front matter (line 9) agree.
- **New §89** records everything since V16.15 that wasn't in the manual, in 14 parts:
  - billing (built, switched off);
  - pricing wording for card and monthly-only countries;
  - the countries research, Dominic's rules and the 167 new rows;
  - region blocks;
  - the country selector;
  - languages;
  - the apps;
  - the email sender;
  - Search Console;
  - the demo's menu carry;
  - the capacity-window diagnosis;
  - collection times (what V16.17 left out);
  - what is pushed and run;
  - a backlog.
- **New invariants 35.ar-1 to 35.ar-8:**
  - billing's one rules module;
  - no billing text says walk-ups or the kitchen screen keep working;
  - no billing notices or purchase buttons in iOS;
  - billing inert while switched off;
  - one card-country helper;
  - the menu currency for a truck's own money;
  - region blocks in one place;
  - rows inserted off, with a separate switch-on after deploy.
- **The "UK only" correction is done everywhere:**
  - 14 places struck and corrected in the manual's own ⛔ style;
  - the full App Store history: 44 storefronts from 31 Aug, 42 from 9 Nov, all 175 since 12 Nov.
- **44 older statements are marked corrected or extended** (billing, pricing, email, search, demo, capacity, collection times,
  languages).
- **The TAX backlog entry stays.** Three items got a ⛔/✅ note where later work changed them: item 1 (the VAT flag is stored), item 5
  (the region blocks are built) and item 8 (Mexico's switch-off is prepared, not run).
- **Commit:** `ce54cb44` (the manual). This report is committed separately.

## 0 · Flags and readings

- **No span of the brief arrived garbled.**
- **The version number.** The brief is named manual-v16-17, but **V16.17 was already taken**. collection-anchor-1 (`5f4092d2`, 12 Nov)
  wrote V16.17, after longer-intervals (`1ea69047`) wrote V16.16. Folding this work into another session's V16.17 would have mixed two
  deltas under one number. Since the brief says to bump the version, this delta is **V16.18**. I didn't treat it as a contradiction,
  because no instruction asked for the number 16.17 itself. Say if you want it renumbered.
- **"The iPad/Android apps are NOT UK only".**
  - **The App Store part is fully evidenced** (ios-intl-1 §0, §2). Since then it has moved twice: Moldova and Ukraine were removed on 9
    Nov (42), and every territory was added on 12 Nov (175; world-countries-5). The manual records all three steps.
  - **For Google Play, no report says where the listing is available.** The manual's last word was "Availability is the United Kingdom
    only, deliberately" (stated 1 Sep).
  - So the manual records your 12 Nov correction as stated ("not UK-only"), with "Play's countries are set by hand in Play Console; the
    current list is not recorded here". It invents no number.
- **The countries numbers** (210 / 41 / 9 / 11 / 19; no tax registration outside the UK except the EU OSS later):
  - None of these is in the world-countries-4 *report*. They come from the manual's own TAX entry (your "landing" commit `9c30a623`)
    and the CSVs.
  - I checked them against the files: `go-live.csv` has 210 rows and 41 `vat_number_required`.
  - The 19 excluded are the report's 14 (CU, IR, KP, RU, BY, SY, CN and 7 uninhabited) plus EH, AF, SO, YE and SD, matching
    249 − 210 − 9 − 11 = 19.
  - §89.3 lists all four groups by name.
- **"Stripe's own customer emails off"** is recorded as the decision (billing-2 §6). No report says the Dashboard switch has been
  flipped, so §89.1 and the backlog carry it as a hand step.
- **An error in the world-countries-5 report** (mine; I couldn't fix it under this brief): its "later languages" table calls Kenya and
  the Philippines "already live". They are not: both are on the cannot-sell list and have no row. §89.3 says so.
- **An unresolved conflict, recorded rather than resolved** (§89.8):
  - email-sender-1 guesses `NEXT_PUBLIC_SUPPORT_EMAIL` is a villagefoodie address in Vercel.
  - The manual records it as hello@hatchgrab.com (set 2 Nov, stated).
  - Only you can say which is true.
- **"Collection times counted from the event start"** was already in V16.17. §89.12 adds only what V16.17 left out:
  - the backup picker's two side effects;
  - off-grid existing orders;
  - `production_slot`;
  - the removed helpers.
- **The pricing-copy-4 report says 161** new countries are monthly-only. The rows have **160** `billed_at_truck` plus 7
  `fee_from_payment` = 167, so the manual says 160.

## 1 · Reports used

| Report | Where it went |
|---|---|
| billing-1, billing-1-stripe, billing-2, billing-3 | §89.1, 35.ar-1 to 35.ar-4, §89.14; 19 older statements corrected |
| pricing-copy-1, -2, -3, -4 | §89.2, 35.ar-5; 6 older statements corrected |
| world-countries-4 (+ `countries.csv`, `go-live.csv`, `gemini-tax-84-countries.md`, `gemini-tax-list-1.md`, `gemini-tax-list-2.md`) | §89.3 |
| world-countries-5 | §89.3, §89.4, §89.5, §89.7, 35.ar-6 to 35.ar-8; the TAX entry notes |
| languages-world-1 | §89.6, §89.14 (native checks); 4 older statements corrected |
| languages-world-2 (and `docs/languages-world-2/handover/`) | §89.6, §89.14 (resume; the ticket "?"; native checks) |
| ios-intl-1 | §89.7; the "UK only" corrections |
| meta-sdk-1 | §89.7 |
| email-sender-1 | §89.8; 6 older statements corrected |
| gsc-index-1, gsc-index-2 | §89.9; 1 corrected |
| demo-claim-1, demo-claim-2 | §89.10; 1 corrected |
| capacity-window-1 | §89.11; 1 marked as an open defect |
| collection-anchor-1 | §89.12 (what V16.17 left out); 2 corrected |

**Found but left out:**
- **compare-ux-1, manual-jp-fix and manual-v16-15:** already in the manual (V16.15 block, §88, 35.aq-13 to 35.aq-16).
- **longer-intervals:** it has no report file. Its work is the V16.16 block, already in.
- Reports committed before `e7bd7361` are outside the brief.

## 2 · What was added

| Where | What |
|---|---|
| Header, front matter | V16.17 → **V16.18** (both strings; grep checked) |
| **Changelog V16.18** | The "UK only" correction; billing; pricing wording; countries (and that the switch-on is NOT run); languages; the other work; backlog; what is pushed |
| **§89.1** Billing | State (switch false, 6 migrations run, nothing charged, test key only); the 11 rules with your wording; tables, code, routes, screens, notices, emails, harnesses; the switch-on steps in order; known limits |
| **§89.2** Pricing wording | "Online orders" everywhere (20261091 run); the card / monthly-only table from pricing-copy-4; how a country is classified; Serbian dates; harnesses |
| **§89.3** Countries | world-countries-4's research and Dominic's rules with every group listed; world-countries-5's rows, migrations (3 run, the switch-on NOT run, with its contents), locales, billing models, 127 currencies, the menu currency, settings, deploy-before-switch-on |
| **§89.4** Region blocks | What is blocked, how it is matched, the refusal; Bender kept |
| **§89.5** Country selector | Regions, sizes, names (Serbian in Latin script), screenshots |
| **§89.6** Languages | languages-world-1 (8 bases, 39 variants), languages-world-2 (12 of 23, paused, handover kit), 48 bases and 103 locales, open decisions |
| **§89.7** Apps | The availability history (44 → 42 → 175); Play; the store flags (the 17 Android-off countries); ios-intl-1's 1.1 build and its open steps; the ASC key outside the repo; meta-sdk-1 |
| **§89.8–§89.12** | Email sender; Search Console; demo menu carry; capacity window (open defect); collection times (V16.17 additions) |
| **§89.13** | Pushed (origin/main `9c30a623`; 37 local commits) and run (every migration except 20261095 and the plan-offer SQL); the last sweep |
| **§89.14** Backlog | Kitchen tickets print non-Latin scripts as "?" (and that live Greek, Bulgarian, Japanese, Chinese, Thai, Arabic and Hebrew are already affected); resume languages-world-2; country-specific terms; native-speaker checks per language; the billing switch-on and hand steps; the account lock; VAT capture; terms wording; the card-fee comparison line; the capacity defect; the Android flags; the switch-on itself |
| **35.ar-1 to 35.ar-8** | The billing, pricing and country invariants above |

## 3 · Older statements marked corrected (in the manual's ⛔ style; the struck text kept)

- **"UK only" (14):**
  - the V16.10 changelog notes (3);
  - §11 (2);
  - §27 "make the apps available in the US";
  - §36 Play availability;
  - §48 badges;
  - §49's lookup line;
  - §85.6 (2);
  - §85.7;
  - §86.2.
- **Billing (19):**
  - §4's Billing tab;
  - §27 (platform fee charging, monthly plan billing, the fee switch-on, subscription billing ×2);
  - §37 (period, "blocked behind subscription billing", straddling order, partial refunds, "never billed");
  - the platform-fee observation;
  - §40 ("nothing can charge a card", "no operator can change their plan", the Android Play decision);
  - the terms note;
  - §81 (Gusto's trial end, the fee engine, `offered`, the "we'll be in touch" wording, Pay at Hatch's intended rule);
  - §82.11's billing item.
- **Pricing (6):**
  - §81.1's fee row;
  - `public.plans` description;
  - §81.4's landing footnote;
  - /llms.txt;
  - the terms' fee line.
- **Email (6):**
  - the sender lines in §2/§13/§17 and §43;
  - `HATCHGRAB_SENDER` (marked fixed);
  - the competitor email's secrets.
- **Other (8):**
  - hreflang;
  - the demo import;
  - the slot dots (open defect);
  - ASAP rounding;
  - the backup picker;
  - `LOCALES` / bases;
  - right-to-left;
  - legal translations;
  - badges.
- **Left alone on purpose:**
  - the changelog *history* tables of V16.7 and V16.10, which record what was corrected then;
  - lines already struck in earlier versions;
  - unrelated "UK only" uses (competitors, Village Foodie's Tally, the router's GB fallback, Gusto's testimonial).

## 4 · Checks

- `git diff` before committing: 562 insertions and 62 deletions. Each deleted line is one of the 2 version strings or a line re-added
  with its correction.
- grep after editing: no "UK only" app statement is left without a ⛔ marker.
- grep: the header and the front matter both say V16.18.
- No code changed, so no sweep was needed. The last full sweep (12 Nov, after `10b41ccc`) is recorded in §89.13: 218 run, 212 passed;
  5 legal-page failures and 1 build-dependent.

## 5 · Commits

- `ce54cb44` manual-v16-18: the reference manual at V16.18 (`docs/reference-manual.md`).
- The commit adding this report (`docs/manual-v16-17-report.md`).

Both are on main, by explicit path. Nothing is pushed or deployed.
