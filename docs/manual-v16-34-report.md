# manual-v16-34 — applying reference-manual-delta-v16-34.md (V16.33 → V16.34)

**Date:** 23 November 2026 · **Asked by:** Dominic ("Apply ~/Downloads/reference-manual-delta-v16-34.md to docs/reference-manual.md
exactly as its HOW TO APPLY section says").

**Commit:** add6a761, `docs/reference-manual.md` only. It is local and not pushed. This report goes in a separate commit.

**Checks:** only read-only checks and SQL, shown inline in chat.

**Not touched:** no `.env*` file was opened; nothing was pushed or deployed; Pizzeria Gusto and Le Roi du Churrasco.

## Summary

- **The manual is V16.34.** Both the running header and the front matter say so, and a grep confirms they agree.
- **What was applied, step by step, as the delta's HOW TO APPLY says:**
  - the V16.34 changelog entry, at the top of `# Changelog`;
  - the two standing rules;
  - the Open items, edited in place;
  - the reference changes, in six sections.
- **The read-only checks all ran.** They confirm the delta's facts, except where those were overtaken by 22 Nov. The manual
  records today's values with the date, and they're flagged here:
  - locales in use: **106**, not 103;
  - message files: **114 = 60 + 54**, not 111 = 57 + 54;
  - the FAQ 404s are wider than /tz and /ad.
- **Nothing arrived garbled, and no instruction contradicted another.**

## 1 · What was applied

| HOW TO APPLY step | Where | What |
|---|---|---|
| 1 · Version | line 1, line 9 | `HatchGrab Engineering Reference Manual · V16.34`, `**Version 16.34**` (grep: both agree) |
| 2 · Changelog | top of `# Changelog` | the V16.34 entry as given, plus two bullets: the new standing rules, and **OBSERVED, read-only, 23 November 2026** (§2 below) |
| 3 · Open items | `# Open items (V16.34, 23 November 2026)` | see the table below |
| 4 · Standing rules | after the existing standing rules, just above the Open items | **DEPLOYS** and **TRANSLATE ONLY WHAT'S USED**, worded as the delta gives them |
| 5 · Reference | six sections, found by heading text | see the next table |
| 7 · Nothing else | — | Other "V16.33" labels in the manual are dated history and were left alone |

**Open items:**

| Item | Change |
|---|---|
| 1 (deploy) | The V16.33 deploy paragraph is struck. "✅ Done V16.34: deployed 19 Nov (`16702ae6`, then `1d916cac`) and 22 Nov (`f2e2b4ab`)", plus what was observed on 23 Nov. |
| 2 (iOS 1.1) | Upload the new store listings with it: push-listing with `--only` and the 28 locales (languages-switch-5 §3). |
| 3 (Android 1.1) | Upload the new listings with it, by hand in Play Console, including the 7 in `data/store-listing/play/`. The delta's "Items 2–3" note is split this way because the `--only` flag belongs to the iOS push only. |
| 6 (native checks) | A V16.34 line: km-KH, lo-LA, am-ET, ca-AD, sw-TZ, si-LK. This is the delta's "Native checks now also cover …". It's added to item 6 rather than as a new item, so there's no duplicate (HOW TO APPLY 3). |
| 12 (harnesses) | A ⛔ note that the missing-legal-files cause has closed. It then adds `faq-3-screens` and the sweep's other 16, with "One tidy-up prompt, after the next deploy". |
| 14 (languages) | "✅ languages-world-3 finished 22 Nov". |
| 28 (Supabase sessions) | "keep open unless Dominic confirms he checked (time-boxed sessions and inactivity timeout OFF)". |
| New 35–39 | 35 Vercel cost · 36 FAQ translations after 1 Dec · 37 competitor price check (decision) · 38 price floor (decision) · 39 unused languages' terms. 35 is the next free number. |

**Duplicates checked:** the languages sessions had not added an open item for the unused languages' terms (only a line in §89.6),
so item 39 is the only one.

**Reference changes.** Older text is superseded in place with a one-line ⛔ pointer, and the new text sits in a short V16.34 block:

| Delta line | Section (by heading) | What |
|---|---|---|
| Countries / languages | **§89.6 Languages** | A "Country languages as of V16.34" block, using observed values:<br>- the nine switches with their own-language names;<br>- India and Pakistan on en-GB;<br>- the 8 installed-but-unused locales;<br>- 114 message files = 60 + 54, and 106 locales in use.<br>⛔ pointers on "KH, LA and ET … wait for Dominic" and "whatsNew says 60 languages". |
| Plans / pricing | **§81.6 Offered plans and the trial-end plan** (⛔ pointers) and **§89.2 Pricing wording** (the V16.34 block) | The V16.34 block covers:<br>- all three plans on sale in all 210;<br>- the trial-end plan is Pay as you go everywhere;<br>- the world guard's rule (a) as plans-everywhere-1 changed it;<br>- the post-pay wording and where it shows (data-driven);<br>- the pricing principle (Pro ≈ 2 local meals, easy-number prices, Unlimited ≈ 2× Pro);<br>- Japan ¥1,980 / ¥3,980.<br>⛔ pointers on §89.2's "terms deliberately unchanged" and "every live country is a card country". |
| Billing | **§89.1 Monthly billing** | A V16.34 block:<br>- the terms now match the post-pay design (with the six points);<br>- switch-on still needs items 15 and 19–22, with 20 as a prerequisite;<br>- the lock is decided at switch-on (pause-only until then);<br>- Pro and Pay as you go in billed countries are invoiced monthly once billing is on.<br>⛔ pointers on switch-on steps 3 (terms published) and 8 (the offer, done differently). |
| FAQ | **§82.12 The FAQ** | A V16.34 block:<br>- the show-in values (which payment models map to `card_payments` and `pay_at_truck`, checked in plans-everywhere-2);<br>- the four pay-at-truck answers …1002 / …1006 / …1007 / …1011 with their approved English wording (plans-everywhere-2; the migration was run, per plans-everywhere-3);<br>- the translator's three fixes, and the unchanged $2-per-run cap;<br>- the state on 23 Nov.<br>⛔ pointers on the "No Pay at Hatch wording" decision, the `xx-XX` locale CHECK and "the 28 language bases". |
| Store listings | **§89.7 The apps** | A store-listings block:<br>- "50+ languages";<br>- 30 App Store listings and the 7 in the Play-only folder;<br>- 🔴 the upload uses `--only` with the 28 locales.<br>⛔ pointer on "29 listing locales". |

## 2 · Read-only checks (HOW TO APPLY 6), 23 November 2026

**git:**
- `git rev-parse --short origin/main` → **f2e2b4ab** (after `git fetch`).
- `git rev-list --count origin/main..main` → **5** before this commit. The five are: 2117bbb0, 48fc9490, fc44e0b3, 389e2979 and
  981b888e, all local only.
- **The named commits** (`git cat-file -e`) all exist:
  - 16702ae6, 1d916cac, f2e2b4ab, 0416a7f7, bf971963, 335fc699, 645e145a and a38bfe0d are in origin/main;
  - 2117bbb0, 389e2979, 981b888e and 48fc9490 are local only.

**The delta's SQL, as run:**

```sql
select plan_key, count(*) filter (where pp.offered) on_sale, count(*) filter (where not pp.offered) off
  from plan_prices pp join country_settings cs on cs.country_code = pp.country_code and cs.enabled group by 1 order by 1;
-- payg 210 / 0 · pro 210 / 0 · unlimited 210 / 0

select count(*) from plan_prices where is_trial_end;
-- 1

select country_code, locale, short_name from country_settings
 where country_code in ('AL','AD','BA','MK','LK','TZ','KH','LA','ET','JP') order by 1;
-- AD ca-AD Andorra · AL sq-AL Shqipëri · BA bs-BA Bosna i Hercegovina · ET am-ET ኢትዮጵያ · JP ja-JP 日本 ·
-- KH km-KH កម្ពុជា · LA lo-LA ລາວ · LK si-LK ශ්‍රී ලංකාව · MK mk-MK Северна Македонија · TZ sw-TZ Tanzania

select plan_key, monthly_minor, extra_van_monthly_minor from plan_prices where country_code = 'JP' order by 1;
-- payg 0 / 0 · pro 1980 / 1980 · unlimited 3980 / 3980
```

**Extra read-only checks**, run to record reality where the delta's numbers needed it:

```sql
select country_code, plan_key, offered from plan_prices where is_trial_end;
-- MX unlimited true   (the one row; Mexico is off)
select key from plans where is_expiry_fallback;
-- payg
select count(*) filter (where enabled) enabled, count(*) filter (where not enabled) off,
       count(distinct locale) filter (where enabled) locales_used,
       string_agg(country_code, ',') filter (where not enabled) off_codes from country_settings;
-- 210 · 1 · 106 · MX
select string_agg(distinct locale, ',' order by locale) from country_settings where enabled;
-- 106 locales; compared with messages/*.json → installed but unused: en-BB en-PH fil-PH fr-CI hi-IN ta-LK ur-PK vi-VN
select coalesce(cb.payment_model, '(no row)') payment_model, count(*) from country_settings cs
  left join country_billing cb on cb.country_code = cs.country_code where cs.enabled group by 1 order by 1;
-- billed_at_truck 160 · billed_online 4 · fee_from_payment 46
select locale, count(*) from public.faq_translations
 where locale in ('ca-AD','sq-AL','mk-MK','bs-BA','si-LK','sw-TZ','km-KH','lo-LA','am-ET','uk-UA','it-IT')
 group by locale order by locale;   -- run in languages-switch-5, 23 Nov
-- bs-BA, ca-AD, mk-MK, si-LK, sq-AL, sw-TZ: 14 each · it-IT, uk-UA: 29 · km-KH, lo-LA, am-ET: none
```

**Local file checks:**
- `ls messages/*.json`: **114 files**. 60 have over 3,000 keys (full translations) and 54 are regional add-ons, averaging 193 keys.
- `scripts/harnesses.json`: `faq-3-screens.cjs` is in the excluded list. It is a hand-run screenshot script that needs a build,
  so it is not in the sweep.

## 3 · 🔴 Where the delta and today differ (recorded as reality in the manual)

1. **Locales in use: 106, not 103.** The delta's "103 locales / 50 languages" is plans-readiness-1's figure, from before km-KH,
   lo-LA and am-ET were switched on (22 Nov).
2. **Message files: 114 = 60 full + 54 regional, not 111 = 57 + 54.** The three new full translations (km-KH, lo-LA, am-ET) were
   installed on 22 Nov.
3. **The FAQ 404s are wider than "/tz/faq (and /ad/faq)".**
   - /al, /mk, /ba and /lk/faq also answer 404. Each of those locales has 14 translation rows, against 29 for Italian and
     Ukrainian.
   - Open item 36's text records this.
4. **`is_trial_end` count = 1, not 0.**
   - It's Mexico's Unlimited row. Mexico is off, and plans-everywhere-1 left it untouched by design.
   - The delta's "is_trial_end no longer on Unlimited" holds for every enabled country, and trials fall back to payg.
   - The manual says both.

Everything else matches: the plan counts, the ten country rows, Japan's prices, the payment-model split, the commits and the eight
unused locales.

## 4 · Flags

- **Garbled spans:** none in the prompt or the delta.
- **Contradictions:** none.
- **Item 6 instead of a new item:** the delta lists "Native checks now also cover …" under New items. Item 6 is already the
  native-checks item, so the line went there, following HOW TO APPLY 3 ("keep one, don't duplicate").
- **Item 3's wording:** the delta says Items 2–3 upload the listings "using `--only` and the 28 locales". `--only` is a flag of the
  App Store push (`scripts/ios/push-listing.cjs`). Android's listings are set by hand in Play Console, so item 3 says that, and
  points to the `play/` folder.
- **Item 12's opening text** ("the five failing harnesses … translated legal files missing") is no longer the reason. I added a ⛔
  line saying the cause has closed, rather than deleting it. This follows the manual's convention for superseded text.
