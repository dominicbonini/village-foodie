# manual-v16-2 — the reference manual moved to V16.2 (plans and pricing as data)

**Date:** 20 October 2026 · **Branch:** main · **File changed:** `docs/reference-manual.md` only (uncommitted; nothing
committed, pushed or deployed by this task) · **Delta applied:** `~/Downloads/reference-manual-delta-pricing-plans.md`

**Summary.**
- **V16.1 → V16.2**, both version strings bumped:
  - header line 1: `HatchGrab Engineering Reference Manual · V16.2`;
  - front matter line 9: `**Version 16.2**`;
  - no 16.1 header or front-matter line remains.
- **Applied as the delta's HOW TO APPLY says:**
  - the changelog block went on top of `# Changelog`, above `## V16.1`;
  - **§81** went after §80;
  - Part C corrections went into §4, §21, §44, §76.1/§76.7, §43, §48, §49, §27, §35 (35.aj) and §79;
  - the Part D sweep ran, and its counts are in the SWEEP STATUS line.
- **Older changelog entries are byte-identical** (diffed against `HEAD`).
- **Where the delta and reality differ, the manual records reality** (the delta's step 7) and the differences are
  flagged below. The biggest one: **the work is deployed.** `origin/main` is `4633801c`, and the live site serves it.
- **Nothing was garbled**, and no two instructions contradicted each other, so nothing stopped the work.
- **No `.env*` file** was opened, read, listed or parsed.

---

## 1 · Sweep status (as recorded in the changelog)

> stale plan-model references found: **134**; corrected in place: **105**; left as history (changelog only): **29**;
> outstanding: **0**.

| Grep (over the V16.1 text) | Lines | In the Changelog | Outside |
|---|---|---|---|
| 1 — retired modules and constants | 93 | 19 | 74 |
| 2 — retired `country_settings` column names | 0 | 0 | 0 |
| 3 — retired labels, figures, the `'2'` mask, `robots.txt` | 47 | 12 | 35 |
| **unique lines** (6 lines match both 1 and 3: 2 in the Changelog, 4 outside) | **134** | **29** | **105** |

**How the 105 were handled:**
- **61 were edited:** struck with `~~…~~` and followed by `⛔ Corrected V16.2 — …`, or annotated inline.
- **44 are covered by a note or banner:** they sit in a paragraph, or a dated history subsection, that now carries a
  `⛔ Corrected V16.2` note or banner. Examples:
  - §4's SUPERSEDED banner;
  - "the three entries below are history";
  - the code snippet's note.
- **The 29 Changelog hits were counted and not edited.**
- Every hit was checked by script: the original hit lines were matched against the new file, and every one is either
  changed or inside a paragraph or subsection with a V16.2 note.
- The markdown check found **0 paragraphs with unbalanced `~~`**.

**A wider check, beyond the delta's patterns.** I searched for `Starter`, `Max`, `MAX_FEATURES`, `TRIAL_FEATURES`,
`PRO_FEATURES`, `£49`, `'starter'` and `'max'`, outside §4 and outside paragraphs already corrected.
- It found **41 more lines that still describe the retired tiers.**
- **They are not corrected**, because the delta's sweep doesn't cover them.
- They are flagged in the SWEEP STATUS line and carried as one §27 item. The list:

| Line | Section | Text |
|---|---|---|
| 8673 | §5 | …n item tap. Sends truck notification (WhatsApp on Max, else email).… |
| 9491 | §9 | …cook_screen is still sold as a Max feature while the board is no longer ga… |
| 9816 | §11 | …ground sound, screen wake, and Bluetooth printer (Max, post-trial). The Next.js UI is reused … |
| 10039 | §11 | …print of a kitchen ticket when an order is DUE. **MAX-plan feature** — gated via the… |
| 10058 | §11 | …-only** (return null unless isNativeApp()), **Max-gated** (canAccess ticket_printing). … |
| 10682 | §11 | …he premise that can('cook_screen') gates a sold Max feature. **Its marketing row is… |
| 10684 | §11 | …plan column, Max included.** ⚠️ **Worse than a stale cla… |
| 10687 | §11 | …plan = 'trial' with TRIAL_FEATURES = [...MAX_FEATURES], so **no live enti… |
| 10733 | §11 | …fourth control. Rows 3, 7 and 8 do not exist. The Max gate keeps working. **Nothing changes o… |
| 12343 | §16 | …— the compare table currently advertises this as Max: ✓.… |
| 12961 | §18 | … on customer self-order (not manual). WhatsApp on Max (Meta Cloud API where wired), else emai… |
| 13120 | §19 | …- **Starter** — Event filter only (filterMode force… |
| 13121 | §19 | …- **Pro / Max / Trial / Tester** — Full filter toggle… |
| 13127 | §19 | …r offers CSV export. The tier line is *raw data = Starter, analysed insights = Pro*. CSV is raw d… |
| 13160 | §19 | …## Pro placeholder card (Starter view)… |
| 13162 | §19 | …s, and event ROI comparison. Available on Pro and Max.*… |
| 13742 | §20 | …ed so they are not re-opened:** not plan-gated (a Starter operator seeing… |
| 14244 | §20 | …passes, every Max-inherited feature switches off on a liv… |
| 14550 | §21 | … re-tier features (e.g. moving Messenger/Insta to Max) for API cost — the cost is rounding-er… |
| 15305 | §27 | …- **Rewording the Max marketing row** — it promises an *order… |
| 16040 | §27 | …ecks. ⚠️ The trial's marketing description says *"Max tier + Pay at Hatch ordering"*, which t… |
| 19752 | §35 | …log line** — and a trial truck carries the full Max set \|… |
| 23008 | §37 | …- **The subscription (£29/£49) is a DIFFERENT Stripe product** — Stri… |
| 24240 | §38 | …**Digital loyalty stamp cards** added to the Max pricing card with the card's own .soon… |
| 24255 | §38 | …⚠️ **The Starter card was never missed** — the iPhone wo… |
| 24891 | §40 | …false — less than Starter — and nothing writes the plan value bac… |
| 26023 | §46 | …⚠️ **THE MAX MARKETING ROW IS NOT SATISFIED BY THIS … |
| 29974 | §64 | …ey is on Pizza Kitchen, which is on trial, and TRIAL_FEATURES spreads MAX_FEATURES.… |
| 30479 | §67 | …cannot drift). Gated by schedule_graphics (Pro, Max, trial) **in the UI and again in… |
| 30592 | §68 | … a **Pro** plan key (private_events, split from Max's event_types), scraper marking,… |
| 30920 | §70 | …- **Max + trial only**, through the one gate on… |
| 31186 | §70 | …**Every plan.** Event-type price RULES stay Max.… |
| 31227 | §70 | …  Max gets Standard + Private + its own, Pro … |
| 31332 | §73 | … private event cannot also be Festival or Pub — a Max truck wanting different prices for one … |
| 31442 | §73 | …\| event_types (**Max**) \| making your own named presets; the… |
| 31446 | §73 | …the PRICES band carry a **Max** badge and are refused server-side. ⛔ … |
| 31447 | §73 | …t_types would have hidden a Pro feature behind a Max wall.… |
| 31588 | §73 | …ferent prices for specific events or festivals. · Max · coming_soon… |
| 31590 | §73 | …eature a Pro truck pays for) or true (promising Max's pricing to Pro).… |
| 31595 | §73 | … prices and settings for events and festivals." \| Max \| event_types \|… |
| 31750 | §74 | …ys "Private events with their own ordering link"; Max says "Custom event… |

The same check also matched these lines, which are **not stale** and were left alone:
- §4's loyalty heading (already corrected);
- "ready time is the MAX across categories" (§6, not a plan);
- the two §11 `cook_screen` lines (already struck in V11);
- §21's "their Starter-equivalent" (a competitor's tier);
- §4's struck "Starter sentence" copy note.

## 2 · What went where

| Delta part | Where in the manual | Notes |
|---|---|---|
| **A** — changelog block | Top of `# Changelog` (line 53) | Inserted verbatim. Then come the filled SWEEP STATUS line and an **"OBSERVED WHEN APPLYING"** list, the same pattern as V16.1's "THE DELTA, CHECKED AGAINST THE MANUAL". |
| **B** — §81 | After §80, before "End of manual" | Inserted verbatim, with ⚠️ OBSERVED notes added in place: real-thai-food; the two trigger names; the re-checked CHECK definition; the migrations; Pay at Hatch's second switch; the module map. |
| **C** §4 | | SUPERSEDED banner at the top. Struck: the Starter/Pro/Max list and the Trial line; the expired-trial rule (the three-state table, the cliff paragraphs, the Starter-fallback entry); "Two gating entry points"; `PLAN_ORDER`; the pricing matrix (all 27 rows and the header, cell by cell), its notes and footnotes 1–5 with "NUMBERING STOPS AT 5"; the pricing rationale; the feature gating rules; the parity guard; the V11.38 constants (banner); Billing (one data-driven card); loyalty and branded QR (every plan); the `maskPrice` and footnote-key lines. |
| **C** §21 | | Plan labels struck. The Honest comparison rule replaced with the delta's wording. A new "Competitor research" subsection (see flag 5). |
| **C** §44 | | `CARD_FEES` struck: card fees are `country_settings` `card_fee_*` plus `lib/card-fees.ts`. The literal-price-copies line is marked **CLOSED V16.2**. The `'2'`-mask entry is marked CLOSED. |
| **C** §76.1 | | GB rows struck. The US NULL row is corrected to $0 / $29 / $69. The CHECK sentence is struck (the trigger; the US can be switched on). The six columns are added to "Retired, kept not dropped", with their observed GB/US values. |
| **C** §76.7 | | The data-built line added. The "refused" sentence corrected (see flag 6). |
| **C** §43 | New subsection at the end | "Terms §4 and the terms dates", checked against `content/legal/terms-and-conditions.md` and `lib/legal.ts`. `COUNTRY_TERMS_UPDATED` stays 19 Oct. |
| **C** §48 | Two new subsections at the end | The International SEO block adds two observed facts: `public/robots.txt` is gone, with its rules now in `app/robots.ts`; the apex is still 307. |
| **C** §49 | New current block; heading now "current at V16.2" | V16.1's block stays below as dated history. The posture written is the **observed** one (flag 1). |
| **C** §27 | New V16.2 block at the end; older lines resolved in place | Resolved: the US plan-prices lines (V15.8, V16.0, V16.1); the Starter fallback, `canAccess`/`hasFeature`, the expiry cliff and trial nomination (V11, V11.1, V11.15, V11.19); the `'2'` mask (V11.5); subscription billing's "Pro £29 / Max £49". Two lines added: outreach company details, and the 41 wider candidates. |
| **C** §35 | **35.aj** after 35.ai | The 8 invariants, verbatim. |
| **C** §79 | Added at its end | Harness kit, new harnesses (all present and listed in `harnesses.json`), production-build proofs. |
| **D** | Throughout | §1 of this report. |

**Also corrected, outside the delta's list, because the code contradicts the manual:**
- §2: "Online card pre-orders are a Pro/Max feature; Starter is Pay-at-Hatch only."
- §3: `lib/plan-features.ts`, `lib/features.ts`, `canAccess` vs `hasFeature`, `FEATURE_SECTIONS`.
- §16: `trucks.plan` "default 'starter'"; it has no default and is a FK.
- §35.ai and §76.9: `withPlaceholderPlanPrices`, `planPricesDecided` and `requirePlanPrice`; none of them exists in
  code now.
- §43, §52 and §60: the outreach company line (flag 2).

## 3 · Flags — where the delta and reality differ (the manual records reality)

1. **The deploy posture is wrong in the delta.** It says the work is "partly uncommitted … Nothing deployed". Observed
   about 17:30 BST on 20 Oct:
   - **HEAD = `origin/main` = `4633801c "compare page"`** (Dominic, 17:10), on top of `755c284c`. That `origin/main` is
     the local ref; no fetch was run.
   - **Only two files are uncommitted:** `scripts/outreach-instant-send.cjs` and `scripts/outreach-mail-send.cjs`
     (plus this task's manual edit and report).
   - **The live site serves it.** `www.hatchgrab.com/uk` shows Pay as you go / Pro / Unlimited and "First 3 months
     completely free, everything unlocked". `/uk/features` has the new h1. `www.villagefoodie.co.uk/sitemap.xml`
     lists `/contact`, a change made in `4633801c` itself.
   - So **the deployed build includes the last commit.** Who deployed it, and when, was not observed. §49 says this.
2. **The outreach company line, which the delta doesn't mention.** It was removed on 20 Oct at your request and is
   committed in `4633801c`.
   - The V16.1 text in §43, §52 and §60 said every outreach email ends with it. That is now struck and corrected.
   - §43 notes the **UK Companies (Trading Disclosures) Regulations 2008** point: business emails are expected to
     show the registered name, number and office, so with the line gone the signature would need to carry them.
   - This is not legal advice; it's your call, and it's a §27 item.
3. **real-thai-food: the statement was not run.** The live row is `plan = 'trial'`, `is_customer = true`,
   `trial_expires_at = 2026-09-30 00:00:00+00`.
   - Because that date has passed, it **already resolves to Pay as you go** with its switches.
   - The delta's §81.1 sentence is kept, as the decision, with the observed row beside it. §49 and §27 list it as
     pending.
4. **The trigger names differ.** The delta names one trigger, `plans_keep_enabled_countries_priced`, "on `plans` and
   `plan_prices`". Live there are **two**:
   - `plans_keep_enabled_countries_priced` on `plans`;
   - **`plan_prices_keep_enabled_countries_priced`** on `plan_prices`;
   - plus `country_settings_require_plan_prices` on `country_settings`.
5. **The competitor research has no source in `docs/`.** The delta says "Point to `docs/` reports for sources", but
   `grep` for "EasyEats" or "Eventifood" over `docs/*.md` finds only the manual. §21 records the figures as the delta
   states them and says their sources are unrecorded.
6. **§76.7 was stale beyond the delta.** It said a US prospect's plans PDF "is refused … until US plan prices are
   set".
   - The code now **builds it with every amount masked** ("TBC"/"TBD") while the country is switched off
     (`lib/plans-pdf.ts` `buildPlansPdfHtml`; the attachments route has no such refusal).
   - The corrected line says so. It is consistent with the delta's §81.5.
7. **Pay at Hatch's "two switches".** The delta says the column and "a `plan_features` row" mean the same thing.
   **No such row exists live.** The key is a `Feature` (`PAY_AT_HATCH_FEATURE`), so a row *could* be added. Recorded
   in §81.3 and §27.
8. **Backlog lines the delta names, but which weren't in the manual as §27 lines:** the trial popup's "free Starter
   tier" promise and the welcome email's trial sentence. The only "free Starter tier" text was §4's V11.15 entry,
   which is now struck.

**No garbled spans** were found in your prompt or the delta. **No instruction contradicted another.** Where the
delta's facts disagreed with the code or database, its own step 7 says what to do (record reality and flag it), so
none of the above was a stop-and-ask.

## 4 · Verified, read-only (20 October 2026)

**Repo:**
- **Present:** every module in §81.3's map, the five new harnesses and five shared modules (all in
  `scripts/harnesses.json`), the four migration files `20261023`–`20261026`, `app/robots.ts` and
  `lib/marketing-meta.ts` (`MARKETING_COPY_UPDATED = '2026-10-20'`).
- **Absent:** `lib/plan-features.ts`, `lib/landing-table.ts`, `lib/legacy-pricing-display.ts`,
  `components/landing/FeatureComparison.tsx`, `lib/copy/weeklyPost.ts` and `public/robots.txt`.
- **Functions:**
  - `canAccess(feature, overrides, planAllows)` is in `lib/features.ts`;
  - `effectivePlan`, `featureAccess` and `upgradePlanFor` are in `lib/plans.ts`;
  - `effectivePlan` drops any plan with a past end date to the expiry fallback;
  - `hasFeature(` has no occurrence;
  - the `plans-server` cache is 60 s.
- **The fee engine:** `lib/order-charge-rules.ts` reads `fee_bps` behind `platform_fee_enabled`, and
  `platform_fee_pct` is marked retired; `lib/payments/capture.ts` has no `application_fee_amount`;
  `refund_application_fee` appears only in a warning comment in `lib/payments/refund.ts`.
- **Surcharge regions:** `card_surcharge_excluded_regions` is loaded and edited in admin, and no order path reads it.
- **Upgrades** are a `mailto:`.
- **The terms:** §4 contains "not registered for VAT", "remind you in the app", "30 days" and "7 days";
  `TERMS_UPDATED = '20 October 2026'` and `TERMS_VERSION = '2026-10-20'`; `terms_version` is written only by
  `app/api/signup/route.ts`.
- **The proxy matcher** reads `_next/static|_next/image`.

**Database** (Supabase `ffphgwonshgxamtvefcv`, SELECT only):
- **`plans`:** the six rows and flags exactly as §81.2 says:
  - payg is the expiry fallback;
  - pro is highlighted;
  - trial is the signup default, with 3 months;
  - demo is the demo plan;
  - tester is internal;
  - every plan has `included_vans = 1` and `pay_at_hatch_allowed = true`;
  - the subtitles are as stated;
  - partial unique indexes exist for one signup default, one expiry fallback, one demo and one highlighted plan.
- **`plan_prices`:** GB and US each have payg 0 / 0 / 99 / 0, pro 2900 / 400000 / 99 / 2900, and unlimited
  6900 / NULL / 0 / 6900.
- **`plan_features`:** four rows, all payg, all false: `event_types`, `instagram_messenger_replies`,
  `schedule_graphics`, `whatsapp_replies`.
- **Security on all three tables:** RLS is on with 0 policies; `anon` and `authenticated` have no SELECT or INSERT;
  `service_role` has both.
- **`trucks.plan`:** `trucks_plan_fkey` → `plans(key)`; no column default; no `trucks_plan_check`.
- **Constraints and triggers:**
  - `country_settings_enabled_needs_prices_chk` is gone;
  - `country_settings_minor_nonneg_chk` is
    `CHECK ((starter_monthly_minor >= 0) AND … (competitor_fixed_minor >= 0))`, which NULL passes;
  - the triggers are as in flag 4.
- **`country_settings`:**
  - GB is enabled, with `platform_fee_enabled` false; its retired columns still read 0 / 2900 / 4900 / 150000 /
    200000 / 0.99;
  - US is not enabled, with `platform_fee_enabled` false; its retired columns are NULL.
- **Trucks:**
  - pizzeria-gusto: trial, ends `2026-12-31 23:59:59+00`;
  - real-thai-food: as in flag 3;
  - tikka-tonic: trial, ends 31 Dec;
  - village-spice: trial, no end.

**The live site** (curl, read-only):
- the pages in flag 1;
- `hatchgrab.com/` → **307** to www, still not 308;
- `www.hatchgrab.com/robots.txt` serves the AI-crawler blocklist.

The read-only queries, written out one per check. They were actually run as three SELECT statements (two of them
`UNION ALL`s), with the same content:

```sql
select slug, plan, is_customer, trial_expires_at from trucks where slug ilike '%real-thai%';
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conname in ('country_settings_minor_nonneg_chk','country_settings_enabled_needs_prices_chk','trucks_plan_check','trucks_plan_fkey');
select conname from pg_constraint where conrelid = 'public.trucks'::regclass and conname ilike '%plan%';
select tgname, tgrelid::regclass from pg_trigger where tgname ilike '%plan_prices%' or tgname ilike '%keep_enabled%';
select * from plan_prices order by country_code, plan_key;
select key, name, subtitle, sort_order, is_public, is_internal, is_trial, is_signup_default, is_expiry_fallback,
       is_demo, is_highlighted, pay_at_hatch_allowed, included_vans, trial_months, active from plans order by sort_order;
select * from plan_features order by plan_key, feature;
select country_code, enabled, platform_fee_enabled, starter_monthly_minor, pro_monthly_minor, max_monthly_minor,
       pro_allowance_minor, max_allowance_minor, platform_fee_pct from country_settings order by country_code;
select column_default from information_schema.columns where table_schema='public' and table_name='trucks' and column_name='plan';
select relname, relrowsecurity from pg_class where relname in ('plans','plan_prices','plan_features');
select c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT'), has_table_privilege(r.rolname, c.oid, 'INSERT')
  from pg_class c cross join pg_roles r
 where c.relname in ('plans','plan_prices','plan_features') and r.rolname in ('anon','authenticated','service_role');
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='plans';
select slug, plan, is_customer, trial_expires_at, plan_price_override_minor from trucks
 where slug in ('pizzeria-gusto','real-thai-food','tikka-tonic','village-spice');
```

## 5 · What I did not do

- **Nothing was committed or pushed.** `docs/reference-manual.md` and this report are uncommitted.
- **No database write.** I did not run the real-thai-food statement; that is yours.
- **The 41 wider Starter/Max lines are not corrected** (§1); they are a §27 item.
- **No harness, build or product code was touched** by this task.
