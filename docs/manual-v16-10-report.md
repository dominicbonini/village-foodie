# Manual V16.10: applying `reference-manual-delta-v16-10.md`

*3 November 2026, about 14:00–14:50 UTC. `docs/reference-manual.md` is now at **V16.10**. Read-only checks only: SQL
through the read-only connection, `git fetch` / `git log` / `git status`, and curl of public pages. **No `.env*` file was
opened, parsed, listed or tested.** The manual edit is **not committed** (neither the prompt nor the delta asks for a
commit).*

## Flagged before applying

- **No garbled spans** in the prompt or the delta.
- **One conflict, put to you rather than chosen:** the delta's HOW TO APPLY step 10 says "every query in your chat reply
  as fenced blocks", but the prompt says the chat holds "only a two-line summary". Every query and its result is in this
  report (§6), which both instructions ask for; the chat follows the prompt's format and asks whether you want the
  queries pasted there too.
- **An earlier standing instruction said not to touch `docs/reference-manual.md`.** This prompt explicitly asks for the
  edit, so the latest instruction was followed.
- **Precondition met:** the manual was at V16.9 (header and front matter), applied 1 Nov.

## 1 · What was applied

| Part | Done | Where |
|---|---|---|
| Version | header `· V16.10` and front matter `**Version 16.10**`; the month line stays November 2026 | lines 1 and 9 |
| A · Changelog | new top entry, with a "where it went" table, a SWEEP STATUS line and OBSERVED WHEN APPLYING | top of the Changelog |
| B · New subsections (one per subject; the FAQ and search changes take two) | the FAQ | **§82.12** (new, at the end of the marketing / AI-search section where §82.9 had parked it) |
| | search and AI search after faq-2 Part B (redirects, noindex, `operatingSystem`, `/llms.txt`, IndexNow, 308s) | **§82.13** (new) |
| | migrations run by Cursor | **§79** (added at its end) |
| | HatchGrab's own contact form | **§48** (new subsection) and **§43** (its email, new subsection) |
| | app badges and the app flags | **§48** (new subsection); §11 corrected |
| | the checker's tiers and "not mentioned" | **§86.15** (new) |
| | Pay at Hatch: today and intended (with the faq-1c mix-up) | **§81.7** (new) |
| C · Corrections | C1–C16 struck in place, marked "⛔ Corrected V16.10" (§2) | §11, §12, §16, §20, §27, §35.ak-7, §40, §43, §48, §77.12, §79, §81.1, §82.9, §82.11, §84.2, §85.6, §86.10 |
| D · Sweep | 14 patterns over the whole manual: 74 hits; 27 corrected, 26 left as history, 21 a different meaning or still true, **0 outstanding**; 10 more found outside the patterns and corrected (§3) | the SWEEP STATUS line |
| E · Invariants | **35.ao-1 … 35.ao-8**, a new group after 35.an | §35 |
| F · Backlog | new "Added V16.10" block (19 items); struck as done: the FAQ workstream ×3, the contact form ×2, the privacy tidy, the HEAD failures, half-yen, real-thai-food ×2, the apex 307 ×2; annotated: Node 24 for Canada (pending the build log), the dead slot code | §27 |
| G · Deploy posture | a new current block at the top of §49; V16.9's stays as dated history; the heading now says "current at V16.10" | §49 |
| H · Tooling | at the end of §79 (migrations, one prompt at a time, push before "Run workflow", wording ≠ product, no landing changes, the `.env*` breach, the Vercel variables, the new harnesses) | §79 |

The manual grew from 3,523,003 to 3,582,396 characters: 813 lines added, 56 rewritten. Every rewritten line's text is
still there, struck through: checked mechanically, with nothing lost.

```
$ grep -nE "V16\.(9|10)|Version 16\.(9|10)" docs/reference-manual.md | head -4
1:HatchGrab Engineering Reference Manual · V16.10
9:**Version 16.10**
53:## V16.10 — 3 November 2026 — **THE FAQ IN EVERY LANGUAGE ON ITS OWN PAGE, …
```

## 2 · Part C, correction by correction

| # | Claim | What was done |
|---|---|---|
| C1 | The FAQ is parked / designed but not built | §82.9 struck → §82.12; §35.ak-7 "the future FAQ" → "the FAQ"; §27 ×3 struck as done |
| C2 | The contact page is a Tally form with UK wording | §84.2 struck; §77.12's known gap removed; §43 D5 marked done; §27 ×2 struck. Village Foodie's Tally untouched |
| C3 | The apps are UK-only; "any statement … is false" | §11 struck with its date, plus the 3 Nov decision; §27's de-DE `getApp` line struck. The store-listing facts (§36, §85.6, §86.2) are still true (Apple lookup 3 Nov: GB only), so they were left |
| C4 | `operatingSystem` on every page is a known gap | §82.9 struck → per country, now all on (§82.13); §27 struck as done |
| C5 | Signup "free month … first live event" | not in the manual (sweep: 0 stale hits); recorded in the changelog |
| C6 | "Online ordering pauses automatically" | not in the manual; recorded in the changelog and §48 |
| C7 | Adding a van "next billing cycle" | §40's incident narrative annotated with the new message |
| C8 | The Play link pins `hl=en` | not in the manual; §48 records that it no longer does |
| C9 | One 90-day interval; all 45 features checked | §86.10 annotated (46 features, four off, intervals per tier) → §86.15. The two "90-day interval" hits are dated live states |
| C10 | The real-thai-food statement is not run | §12, §16 (`is_customer`) struck; §27 ×2 struck as done; §81.1 corrected |
| C11 | Half a yen (F6, open) | §82.11 struck → round down; §27 struck as done; 35.ao-6 |
| C12 | The apex redirect is 307 | §27 ×2 struck as done; §48's two open items struck; §20's webhook note annotated (lesson kept) |
| C13 | The sweep failures at HEAD | §27 struck as done (all six) |
| C14 | Vercel builds on Node 22 | §27's Canada line annotated: `engines.node` 24.x, the build-log line pending |
| C15 | The Privacy Policy's demo wording | §27 struck as done (tidy-1, all 28) |
| C16 | `sameAs` | no "empty" claim existed; the 2 Nov decision added to §82.9 and §82.13 |

**Out of pattern, also corrected:** §79's "every database change goes to Dominic as … NOT RUN" (superseded by migrations
run by Cursor), and §85.6's app flags "GB true only".

## 3 · Part D, the sweep

The full breakdown is in the SWEEP STATUS line under the changelog entry. In short:

| Pattern | Hits | Corrected | History | Different meaning / still true |
|---|---|---|---|---|
| `FAQ.*(parked\|designed but)\|future FAQ` | 3 | 3 | 0 | 0 |
| `Tally` | 12 | 5 | 4 | 3 |
| `UK App Store only\|UK-only on Play\|apps are UK-only\|not in this country` | 9 | 4 | 0 | 5 (store listings, still UK-only) |
| `operator_apps` | 0 | — | — | — |
| `free month\|first live event` | 5 | 0 | 1 | 4 |
| `pauses automatically` | 0 | — | — | — |
| `next billing cycle` | 1 | 1 | 0 | 0 |
| `hl=en` | 0 | — | — | — |
| `90-day interval\|one interval` | 2 | 0 | 2 | 0 |
| `real-thai-food` | 21 | 5 | 11 | 5 |
| `half a yen\|half-yen` | 1 | 1 | 0 | 0 |
| `\b307\b` | 14 | 6 | 6 | 2 |
| `Node 22` | 3 | 1 | 0 | 2 |
| `getSlotIndicator` | 3 | 1 | 2 | 0 |
| **Total** | **74** | **27** | **26** | **21** |

**Outstanding: 0.** Out-of-pattern corrections: 10 (37 in all). Hits inside the new V16.10 entry itself are excluded.

## 4 · OBSERVED WHEN APPLYING (where the live system differs from the delta or adds to it)

1. ⚠️ **The checker's new feature list is not imported yet.**
   - `comparison_features` has **45 rows, every tier null, no `notify`**. The last features import is 30 Oct.
   - The importer runs as the first step of the daily "Competitor check" workflow at 02:10 UTC, so on **4 Nov**.
   - `tier_intervals` is already 90/90/180.
2. ⚠️ **That import will re-tick four features Admin unticked on 2 Nov** (asap, options, staff, walkup; 09:58–10:00 UTC).
   - The 3 Nov feature list keeps them checked, and their stored tier is null, so the import applies the file's
     settings.
   - Allergens stays unticked (off), with `show_scope` `all` from the file.
   - **Any Admin change to these (including allergens → Hidden) should be made after the 4 Nov run.** Recorded in §27
     Added V16.10 and §49.
3. **The FAQ is translated and live:**
   - 27 of the 28 language bases have 29 `ok` rows; `/de/faq` is 200 in German.
   - ⚠️ **cs-CZ has one `failed` row** ("the plan name "Pro" typed in"), so that question is hidden on the Czech page for
     now.
4. **`/de/contact` is a 404.** There is no per-country contact route; the German footer links
   `/contact?topic=General%20Enquiry`. `/contact` has no `tally.so`.
5. **The iOS app is listed in the UK store only** (Apple lookup, 3 Nov: GB 1; DE, US, JP, IE 0). Android is UNVERIFIED.
6. **Delta facts with no report behind them, recorded as stated:**
   - the Session-pooler connection and the 2 Nov password reset;
   - `CONTACT_IP_SALT` Sensitive / `NEXT_PUBLIC_SUPPORT_EMAIL` not Sensitive;
   - the FAQ mockup approval dates (21 Oct, 1 Nov);
   - the sitemap submissions;
   - Dominic's 3 Nov deploy.
   The 308s are confirmed by curl.
7. **db-run-1 checked `.env.local` for `SUPABASE_DB_URL` with a one-key `grep -q`,** against the standing `.env*` rule.
   It is recorded in the backlog item to remove that step from `.cursor/rules/working-rules.mdc` (as the delta says).
   Nothing was printed.

## 5 · Part G, the deploy posture

**Git:**
- `origin/main` = local `main` = **`f67eb787`** "designer-pack-1: report" (2026-11-03 13:52:14 +0000);
- 0 ahead, 0 behind; the working tree was clean before this edit.

**Live (curl):**

| Check | Result |
|---|---|
| `/uk/faq` | 200; one FAQPage JSON-LD, 24 questions |
| `/de/faq` | **200**, German (`lang="de-DE"`, "Was kostet HatchGrab?") |
| `/uk` FAQ section | none (no `id="faq"`, no FAQPage) |
| `/contact` | 200; no `tally.so` |
| `/de/contact` | **404** (no such route; the German footer links `/contact?topic=…`) |
| `/uk` badges | both, the English files; Play link `…?id=com.hatchgrab.app` (no `hl`) |
| `/de` badges | `/badges/apple/de-DE.svg`, `/badges/google/de-DE.png` |
| `curl -I https://hatchgrab.com` | **308** → `https://www.hatchgrab.com/` |
| `curl -I https://villagefoodie.co.uk` | **308** → `https://www.villagefoodie.co.uk/` |
| `/llms.txt` | 200; links `https://www.hatchgrab.com/uk/faq`; "## Frequently asked questions" present |
| Truck pages | no `tally.so` on hatchgrab.com; present on villagefoodie.co.uk (tidy-1 live) |
| Apple lookup id 6803543106 | GB 1; DE, US, JP, IE 0 |

**Dominic to check:** the Vercel build log's `check-tzdata` line says "present".

## 6 · Every query run (all read-only)

**1 · The FAQ**
```sql
select 'faq_items' as t, status, count(*)::text as n, null as extra from faq_items group by status
union all
select 'faq_translations', locale || ' · ' || status, count(*)::text, string_agg(distinct coalesce(reason,''), ' | ') filter (where reason is not null) from faq_translations group by locale, status
order by 1, 2;
```
- `faq_items`: draft 1, published 24.
- `faq_translations`: 29 `ok` for each of ar-AE, bg-BG, da-DK, de-DE, el-GR, es-ES, et-EE, fi-FI, fr-FR, hr-HR, hu-HU,
  it-IT, ja-JP, lt-LT, lv-LV, ms-MY, nb-NO, nl-NL, pl-PL, pt-BR, pt-PT, ro-RO, sk-SK, sl-SI, sv-SE, th-TH and zh-HK.
- cs-CZ: 28 `ok`, **1 `failed`** ("answer: the plan name "Pro" typed in (plan names come from live values)").
- Regional rows: de-CH 4, en-AU 4, en-US 9, es-MX 12, nl-BE 2.

**2 · Contact, the app flags, the checker**
```sql
select
  (select to_regclass('public.contact_messages') is not null) as contact_messages_exists,
  (select count(*) from contact_messages) as contact_messages_rows,
  (select count(*) from country_settings where ios_app_available and android_app_available) as both_apps_on,
  (select count(*) from country_settings) as country_rows,
  (select comparison_status from country_settings where country_code = 'AE') as ae_comparison,
  (select tier_intervals::text from competitor_check_settings where id) as tier_intervals,
  (select string_agg(coalesce(tier,'(null)') || ':' || n, ', ' order by tier) from (select tier, count(*) n from comparison_features group by tier) x) as features_by_tier,
  (select count(*) from comparison_features) as features_total,
  (select show_scope || ' · checked=' || checked from comparison_features where key = 'allergens') as allergens_row;
```
| contact_messages_exists | contact_messages_rows | both_apps_on | country_rows | ae_comparison | tier_intervals | features_by_tier | features_total | allergens_row |
|---|---|---|---|---|---|---|---|---|
| true | 0 | 44 | 44 | off | {"core": 90, "secondary": 180, "commercial": 90} | (null):45 | 45 | all · checked=false |

**3 · The features import and the allergens row's history**
```sql
select (select row_to_json(x) from (select key, checked, show_scope, tier, updated_at from comparison_features where key = 'allergens') x) as allergens,
  (select string_agg(key || '@' || to_char(updated_at,'MM-DD HH24:MI'), ', ') from comparison_features where updated_at > '2026-11-02') as features_updated_since_2nov,
  (select json_agg(json_build_object('file', file_path, 'at', imported_at, 'result', result, 'sha', left(sha256,10)) order by imported_at desc) from (select * from data_imports where file_path like '%features%' order by imported_at desc limit 3) d) as feature_imports;
```
- allergens: `{"checked":false,"show_scope":"all","tier":null,"updated_at":"2026-11-02T09:58:58.473+00:00"}`;
- updated since 2 Nov: allergens@11-02 09:58, options@11-02 09:59, walkup@11-02 09:59, asap@11-02 09:59, staff@11-02 10:00;
- imports: `[{"file":"data/comparison-features/features.json","at":"2026-10-30T08:32:38.787+00:00","result":"ok","sha":"b8ccbd5134"}]`.

```sql
select key, checked, show_scope, show_countries, tier, to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated from comparison_features where key in ('allergens','options','walkup','asap','staff') order by key;
```
| key | checked | show_scope | tier | updated |
|---|---|---|---|---|
| allergens | false | all | null | 2026-11-02 09:58 |
| asap | false | hidden | null | 2026-11-02 09:59 |
| options | false | hidden | null | 2026-11-02 09:59 |
| staff | false | hidden | null | 2026-11-02 10:00 |
| walkup | false | all | null | 2026-11-02 09:59 |

**4 · Pay at Hatch**
```sql
select key, pay_at_hatch_allowed from plans order by sort_order;
```
payg true · pro true · unlimited true · trial true · demo true · tester true.

**5 · The two trucks**
```sql
select slug, plan, is_customer, trial_expires_at, feature_overrides::text as feature_overrides from trucks where slug in ('real-thai-food', 'pizzeria-gusto') order by slug;
```
| slug | plan | is_customer | trial_expires_at | feature_overrides |
|---|---|---|---|---|
| pizzeria-gusto | trial | true | 2026-12-31 23:59:59+00 | {} |
| real-thai-food | payg | false | null | {} |

**Git and curl (as run):**
```
git fetch -q origin
git log -1 --format='%h %ad %s' --date=iso origin/main   → f67eb787 2026-11-03 13:52:14 +0000 designer-pack-1: report
git rev-list --left-right --count main...origin/main     → 0 0
git status --short | wc -l                               → 0
curl -s https://www.hatchgrab.com/{uk/faq,de/faq,uk,de,contact,de/contact,llms.txt}   → 200,200,200,200,200,404,200
curl -sI https://hatchgrab.com          → HTTP/2 308, location: https://www.hatchgrab.com/
curl -sI https://villagefoodie.co.uk    → HTTP/2 308, location: https://www.villagefoodie.co.uk/
curl -s "https://itunes.apple.com/lookup?id=6803543106&country={gb,de,us,jp,ie}"     → resultCount 1,0,0,0,0
```

## 7 · Not done / for Dominic

- **Commit:** the manual edit is uncommitted. Say if you want it committed.
- **The 4 Nov import** (§4 item 2): make Admin changes to asap, options, staff, walkup and allergens after it.
- **The build log's `check-tzdata` line** (Node 24 for Canada).
- **cs-CZ's failed FAQ row:** watch the next translation run.
