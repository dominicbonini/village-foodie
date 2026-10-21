# manual-v16-3 — reference manual V16.2 → V16.3

**Date:** 21 October 2026 · **Input:** `~/Downloads/reference-manual-delta-v16-3.md` (469 lines) · **Changed:**
`docs/reference-manual.md` only (plus this report) · **Branch:** `main` · nothing committed, pushed or deployed ·
no database changes.

## 1. What was applied

| Step (delta's HOW TO APPLY) | Done |
|---|---|
| 1. Versions | Line 1 `HatchGrab Engineering Reference Manual · V16.3`; line 9 `**Version 16.3**`. A grep finds no header or front-matter line still saying 16.2. |
| 2. Part A changelog | Inserted verbatim above `## V16.2`, SWEEP STATUS filled, plus an "OBSERVED WHEN APPLYING (21 October 2026)" list in V16.2's style. |
| 3. Part B §82 | New `# 82. Countries beyond GB and US, currencies and AI search (V16.3 — 20–21 October 2026)` after §81 (before the end-of-manual line), §82.1–§82.10, every "verify" filled from what was observed. |
| 4. Part C corrections | Applied section by section: strike-through (`~~…~~`) plus `⛔ Corrected V16.3 — …`, or a `⛔ V16.3` note where the old line is incomplete rather than false. Nothing deleted. 16 `Corrected V16.3` marks, plus dated notes. |
| 5. Part D sweep | Run; counts below and in the SWEEP STATUS line. |
| Older changelog entries | Unchanged — proved byte-identical (§4). |

## 2. Where the delta and reality differ (the manual records reality)

Observed on 21 October 2026, by read-only SQL, `git` and `curl` (queries in §6).

1. **The anz allergen CHECK (anz-1 block A) has NOT been run.** `country_settings_allergen_set_chk` is still
   `CHECK (allergen_set = ANY (ARRAY['uk14','us9']))`. The delta says "verify it ran". Recorded in §82.2, §82.5, §76.6,
   §49 and §27. Block A must run before block B, or the AU/NZ inserts fail.
2. **Block B no longer has to wait for a deploy.** The delta says block B runs "after the anz-1 code is deployed". The
   anz-1 code is already live in `fcde8b09`, so blocks A and B can run now. Corrected in place in §82.2 and §82.10.
3. **Override sizes:** en-AU has 107 keys and en-NZ has 22, not 110 and 25. landing-mobile-tidy removed the three
   "incl. GST" keys. Corrected in §82.4.
4. **US flags:** the US row has `card_surcharge_allowed`, `service_fee_allowed` and `tipping_enabled_default` all
   **true**. The delta's §82.1 table says the US surcharge is "off". The table cell is struck and corrected, and a
   note under the table records all three flags for every row.
5. **"US platform fee briefly true on 20 Oct"** can't be verified after the fact. Today `platform_fee_enabled` is false
   in GB, IE and US, the only rows. The US row was last written on 20 Oct at 16:28 UTC by `dominic@hatchgrab.com`.
   Recorded in §82.1.
6. **The Billing columns** are `minmax(6.5rem,1fr) repeat(${plans.length}, minmax(4rem, 9.5rem))`: one column per
   public plan (3 today), not a literal `repeat(3, …)`. Corrected in §82.8.
7. **Connect `defaults.currency` for AU/NZ is unverified**, because no AU or NZ test account exists. Recorded in §82.7.
8. **real-thai-food is still not run** (`plan = 'trial'`, `is_customer = true`, `trial_expires_at = 2026-09-30`).
   Recorded in §81.1, §49 and §27.
9. **The delta assumes the work ships together, but currency-registry and ai-search-1 aren't live.** Both are
   uncommitted. `curl` confirms what that means:
   - the live robots.txt still blocks GPTBot, ClaudeBot and CCBot;
   - `/llms.txt` is 404;
   - the live JSON-LD still has `areaServed`.

   Every §82.6, §82.8 and §82.9 statement about them carries "uncommitted at 21 Oct".

**Found while applying, but not in the delta:**
- **The Admin › Countries testing rule** (§76.1) still says "touch only the US column", but the US is now live. I
  noted this beside the rule and didn't change it, because the rule is yours to change.
- **/features still sets the highlighted plan's `pt-hl` class**, but leaves it unstyled. This matches the delta's "no
  highlighted Pro column" and is noted in §81.4 and §82.8.
- **I removed /features' "3 months free" callout** today, during landing-mobile-tidy. It is recorded in §82.8 and §48.

**Verified as the delta states:**
- the IE row: disabled, EUR, uk14, `updated_by` "europe-readiness draft", written 21 Oct;
- the currency CHECK holds exactly the 14 registry codes;
- the three switch-on triggers are present;
- `plan_prices` rows exist for GB, IE and US, and none for AU or NZ;
- trucks are GB/GBP 11 and US/USD 1; orders are GBP 2,931 and USD 5;
- en-IE has 6 keys; `LOCALES` holds five locales;
- there are 149 registered harnesses and 32 `featuresPage.detail` descriptions;
- the robots policy lists in `lib/robots-policy.ts`;
- the `allergenSetForTruck` callers (preview, Twilio, Meta);
- `+353 8[3-9]` in `lib/whatsapp-hint.ts`;
- `lib/outreach-country.ts` and `lib/ai-language.ts` exist;
- the screenshot recipes;
- the apex redirect is still 307.

**Garbled spans or contradictory instructions:** none found. The delta's mismatches with reality are factual, and
HOW TO APPLY item 7 says how to handle them, so I didn't need to stop.

## 3. Part C — corrections by section

| Section | Change |
|---|---|
| §76 | Banner at the top (→ §82). Loader: lists skip an unreadable row; direct reads throw. US row "switched off" struck → on since 20 Oct. IE row noted. "Every truck today is GB" struck → 11 GB + 1 US. Admin › Countries: registry dropdown, signs, red notice, and the testing-rule warning. §76.2: `MINOR_SUFFIX` removed → `minorUnitSuffix` / `minorUnitSign`; decimals and validation from the registry. `areaServed` struck → `countriesSupported`. §76.6 "two lists" struck → three, plus the anz line and the CHECK warning. §76.9 "still switched off" struck. |
| §77 | Sparse en-IE/AU/NZ overrides. Marketing locales for /ie, /au and /nz. "Pay at Hatch … in every country" struck → UK only. Resolver: five locales. Override sizes. `registerNamespace` now lists four override locales, sparse. |
| §78 | New §78.9: `prospectPhoneCountry`, Irish mobiles, the "087…" bug, all prospects GB. |
| §81 | "en-US overrides" struck → four sparse overrides. IE/AU/NZ prices recorded as data. IE/AU/NZ bands. real-thai-food "still NOT run, 21 Oct". The eurozone line notes the IE rows. IE `plan_prices`. Pay at Hatch display word. Observed `platform_fee_enabled` for every row, and US `enabled = true`. Cheapest-bar wording. /features highlight unstyled and descriptions back. |
| §48 | `<html lang>` struck → the page country's locale. Two robots statements noted (HatchGrab host now allows; Village Foodie unchanged). New V16.3 subsection summarising §82.8–82.9, with the live state. |
| §28 | Robots line: no longer "the same rules" on the HatchGrab host. |
| §43 | New subsection: IE/AU/NZ (CA later) terms sections; company details in the email signature. |
| §20 (WhatsApp allergen routing) | A V16.3 note: the guard and caveat are per set, and the three callers pass `allergenSetForTruck(truck)`, with the anz additions. |
| §49 | Retitled "current at V16.3". New current block: git and live state, database state, deploy order. V16.2's block is unchanged below. |
| §27 | "US switch-on" struck → done. Company details → decided (signature). New "Added V16.3" block with the delta's list, plus the three items found while applying. |
| §35 | New 35.ak-1 to 35.ak-8 after 35.aj. |
| §79 | 149 harnesses and the four new ones; WebKit; one dev server on port 3000; the screenshot recipes. |

## 4. Proof the older changelog entries are unchanged

The text from `## V16.2 — 19–20 October 2026` up to `# 1. Purpose of this document` was extracted from `git show
HEAD:docs/reference-manual.md` and from the working file:

- both are 7,581 lines;
- `cmp` reports them identical;
- their SHA-256 hashes match (both start `831de31397dd1b07`).

`git diff -U0` has a single hunk before line 7634: the insertion at old line 52, which is the new V16.3 block above
`## V16.2`. No line in the Changelog was removed or changed.

## 5. Part D — the sweep

The delta's eight patterns, plus three wider forms:
- "en-GB / en-US" and "en-GB or en-US";
- robots statements that name no bot.

Results:
- **Stale references found: 14. Corrected in place: 14. Left as history (Changelog only): 4. Outstanding: 0.**
- **Outside the Changelog:** 43 lines matched and were read. 14 were false:
  - §28 robots;
  - §48: robots ×2 and `<html lang>`;
  - §76: `areaServed` and "two lists";
  - §77 ×7: the full-files line, marketing ×2, "Pay at Hatch in every country", the resolver, the en-US override
    note and `registerNamespace`;
  - §81: "en-US overrides".
- **Still true:** the other 29 lines were left:
  - 3 "minor units" (integer minor units);
  - 3 `platform_fee_enabled` (the default and "off everywhere");
  - 7 "of online orders a month" (allowance figures, not the old band wording);
  - 3 locale lines (the §77.1 audit history, the `messages-parity` description, the hreflang example);
  - 12 other "Pay at Hatch" mentions;
  - the US row's `us9`.
- **Inside the Changelog:** 4 lines matched (two "minor units", two `platform_fee_enabled` false). None is false, and
  none was edited.
- **Patterns with no false statement:** 2 (`MINOR_SUFFIX`, `supportedValuesOf`), 6 (the old band wording) and 7
  (`incl. GST` / `incl. VAT`).

## 6. Read-only SQL run for this workstream

```sql
select country_code, enabled, platform_fee_enabled, currency, allergen_set, updated_by, updated_at from public.country_settings order by country_code;
```
```sql
select country_code, plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from public.plan_prices order by country_code, plan_key;
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass and conname in ('country_settings_allergen_set_chk', 'country_settings_currency_chk') order by conname;
```
```sql
select event_object_table as tbl, trigger_name, action_timing, string_agg(event_manipulation, ',') as events from information_schema.triggers where trigger_schema = 'public' and event_object_table in ('country_settings', 'plans', 'plan_prices') group by 1, 2, 3 order by 1, 2;
```
(returned no rows, because `information_schema.triggers` only shows triggers the role owns; the `pg_trigger` query
below replaced it)
```sql
select id, plan, is_customer, trial_expires_at, country, currency from public.trucks where id = 'real-thai-food';
```
```sql
select c.relname as tbl, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('country_settings', 'plans', 'plan_prices') and not t.tgisinternal order by 1, 2;
```
```sql
select country_code, locale, time_format, date_order, card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor, tap_to_pay_fixed_minor, card_fee_region_label, card_surcharge_allowed, service_fee_allowed, tipping_enabled_default from public.country_settings order by country_code;
```
```sql
select country_code, enabled, platform_fee_enabled, currency, allergen_set, card_surcharge_allowed, service_fee_allowed, tipping_enabled_default, updated_by, updated_at from public.country_settings order by country_code;
```
```sql
select country, currency, count(*) as trucks from public.trucks group by 1, 2 order by 1, 2;
```
```sql
select currency, count(*) as orders from public.orders group by 1 order by 1;
```

I also ran the constraint query and the real-thai-food query a second time on 21 Oct, before writing. The results were
the same.

**Other checks (read-only):**
- `git log origin/main -1`: `fcde8b09 landing page` (Dominic, 21 Oct 12:06 BST), the same as HEAD.
- `git status`: currency-registry and ai-search-1 files are uncommitted.
- `curl` against `www.hatchgrab.com`:
  - `/uk` is 200 and has the tidy wording;
  - `/ie` is a 302 to `/uk`;
  - `/llms.txt` is 404;
  - `/robots.txt` has the old blocklist;
  - `hatchgrab.com` is a 307 to www.

## 7. For you

- **Run anz-1 block A (the allergen CHECK), then block B (the AU/NZ rows)**, from `docs/anz-1-report.md`. The code is
  already live.
- **Deploy order:** commit and push currency-registry and ai-search-1, then block B (if not already run), then Bing /
  Search Console.
- **Decide whether the Admin › Countries test column should move from the US to IE.**

## Undo (only if Dominic asks)

`git checkout -- docs/reference-manual.md` restores V16.2. `docs/manual-v16-3-report.md` is a new file and can be
deleted. No database change was made, so there's no SQL to undo.
