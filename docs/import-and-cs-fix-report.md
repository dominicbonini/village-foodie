# import-and-cs-fix: the features import keeps Admin's choices; the Czech FAQ check

*4 November 2026.*

- **Committed on `main`:** migration `41de9294`; code `489b4f5f` (this report in the commit after it). Not pushed, not deployed.
- **Migration 20261067:** run with `scripts/db-migrate.cjs` (one transaction, no error) and verified read-only. It adds two columns and fills them; no tick or show-on-website value was changed.

> 🔴 **The import this brief wanted to stop has already run.**
> - The daily run's first step imported the new feature list on **4 Nov at 09:02 UTC** (data_imports: `457d8f96…`, ok, `retiered 45`).
> - It ticked **asap, options, staff and walkup** back on. Their show-on-website settings and allergens' untick survived.
> - This change stops it happening again, but it does not put those four ticks back: that would change stored values, which needs your yes (§4).

| # | Item | Outcome |
|---|---|---|
| 1 | The feature import keeps Admin's choices | **Done.**<br>• `checked_by` / `scope_by` ('admin' or 'file') record who set each value; Admin's edits mark themselves.<br>• A re-tiering applies the tier always, but changes `checked` or where it shows only where the file set it last.<br>• OFF features are still unticked.<br>• Proved on the real `features.json` from the 2 Nov state. |
| 2 | The Czech FAQ failure | **Fixed in code.** The reason: `answer: the plan name "Pro" typed in`, from Czech "Pro nejlepší zážitek…" ("For the best experience…").<br>• A plan name, digit or currency symbol now fails only where the English did not have it outside its `{tokens}`, compared like with like.<br>• Czech "Pro" is a listed ordinary word.<br>• Typed "Unlimited", "£29" and "£" still fail.<br>• The row is already retried every hourly run. It passes after your next push (§3). |
| 3 | Full sweep | **186 of 190 pass.** None of the four failures is caused by this change: one fails at HEAD, and three come from another session's uncommitted work in the same repo (§5). |

## 1 · The feature import

**Why it happened:**
- `lib/data-import/features.ts` applied a feature's `checked`, `show_scope` and `show_countries` from the file whenever its stored tier differed from the file's.
- On 4 Nov every stored tier was null, so the first tiered import rewrote all 45. Admin's 2 Nov unticks were therefore overwritten: comparison-features-1's rule ("a rerun keeps Admin's untick") only held while tiers matched.

**What it does now:**
- **New features are added** as before, marked `checked_by` / `scope_by` = 'file'.
- **A re-tiering always sets the tier.** It changes `checked` only where `checked_by` is 'file', and `show_scope` / `show_countries` only where `scope_by` is 'file' (`retierCols`).
- **An OFF tier always unticks** (`checked: false`), even if Admin ticked it, as the brief asked: the checker never asks an off feature.
- **A row from before the two columns existed** counts as Admin's if Admin ever touched it (`updated_by`). That is the cautious reading, because a row-level editor cannot say which field Admin changed.
- **Admin marks its own changes** (`lib/admin/feature-actions.ts`): ticking or unticking sets `checked_by = 'admin'`, changing where it shows sets `scope_by = 'admin'`, and a feature Admin adds is 'admin' on both.
- **A rerun of the same file writes nothing** (it is recorded by sha256 and the tiers match).

**Migration 20261067** (`supabase/migrations/20261067_import_and_cs_fix.sql`, committed `41de9294`):

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261067_import_and_cs_fix.sql
db-migrate: supabase/migrations/20261067_import_and_cs_fix.sql · sha256 d60a6f411c6c8db0 · committed at 41de9294
db-migrate: supabase/migrations/20261067_import_and_cs_fix.sql applied — one transaction, no error
```

```sql
begin;
alter table public.comparison_features
  add column if not exists checked_by text,
  add column if not exists scope_by text;
alter table public.comparison_features drop constraint if exists comparison_features_checked_by_chk;
alter table public.comparison_features add constraint comparison_features_checked_by_chk check (checked_by is null or checked_by in ('admin', 'file'));
alter table public.comparison_features drop constraint if exists comparison_features_scope_by_chk;
alter table public.comparison_features add constraint comparison_features_scope_by_chk check (scope_by is null or scope_by in ('admin', 'file'));
update public.comparison_features set checked_by = case when updated_by is not null then 'admin' else 'file' end where checked_by is null;
update public.comparison_features set scope_by = case when updated_by is not null then 'admin' else 'file' end where scope_by is null;
commit;
```

**Verify (read-only):**

```sql
select
  (select string_agg(column_name || ':' || data_type, ', ') from information_schema.columns where table_schema='public' and table_name='comparison_features' and column_name in ('checked_by','scope_by')) as columns,
  (select string_agg(key || '(' || checked_by || '/' || scope_by || ')', ', ' order by key) from comparison_features where checked_by='admin' or scope_by='admin') as admin_rows,
  (select count(*) from comparison_features where checked_by='file' and scope_by='file') as file_rows,
  (select count(*) from comparison_features where checked_by is null or scope_by is null) as unset,
  (select count(*) from comparison_features) as total;
```

| columns | admin_rows | file_rows | unset | total |
|---|---|---|---|---|
| checked_by:text, scope_by:text | allergens, asap, options, staff, walkup (admin/admin) | 41 | 0 | 46 |

Both CHECKs are in place (`checked_by` / `scope_by` null or admin / file).

## 2 · What is checked and shown after tonight's import

**Tonight's import changes nothing:**
- `data/comparison-features/features.json` is the file imported on 4 Nov (sha256 `457d8f96…`), so the importer finds it already done and writes nothing.
- That stays true after a push, because the file is the same.
- **The state below is today's** (read-only, 4 Nov, after the migration).

**Two columns, two meanings:**
- **Checked** = the automatic checker asks about it.
- **Shown** = whether it appears on comparison pages ("all"; "some" in the listed countries; "hidden" = never).

| Feature | Tier | Checked | Shown | Set by |
|---|---|---|---|---|
| preorder, capacity, ahead, schedule, stock, notify, menuphoto | core | ✓ | all | file |
| **walkup** | core | ✓ ⚠️ | all | **admin** (unticked by Admin 2 Nov, re-ticked by the 4 Nov import) |
| **asap** | core | ✓ ⚠️ | hidden | **admin** (the same) |
| cards, kds, tickets, offline, vans, domain, whatsapp, social, ipad, android, hardware, terminal | core | ✓ | all | file |
| custfee | core | ✓ | hidden | file |
| localpay | core | ✓ | some: PL, NL, BE, SE, DK, NO, CH | file |
| paypal | core | ✓ | some: DE, AT | file |
| discovery | core | ✓ | some: GB | file |
| monthly, perorder, cardfee, term, setup, trial | commercial | ✓ | all | file |
| delivery | secondary | ✓ | all | file |
| fiscal | secondary | ✓ | some: DE, AT, CZ, SE, BE, PL, IT, HU | file |
| tips, payattruck, paymethods, igmsg, loyalty, reports, private | secondary | ✓ | hidden | file |
| **options**, **staff** | secondary | ✓ ⚠️ | hidden | **admin** (the same) |
| allergens | off | — | all (its stored answers still show) | admin |
| deals, qr, buzzers | off | — | hidden | file |

**Totals:**
- **42 checked, 4 not** (the off tier).
- **Shown:** 28 everywhere (allergens included), 4 in some countries, 14 hidden.
- ⚠️ **If you say yes to §4, 38 are checked:** asap, options, staff and walkup become unticked, and nothing about where they show changes.

## 3 · The Czech FAQ failure

**The failed row** (`faq_translations`, read-only):

| | |
|---|---|
| item | `fa000002-0000-4000-8000-000000000007` — "Do I need an iPad, card reader or special equipment?" |
| locale / status | cs-CZ · failed (retried at 2026-11-04 16:27 UTC, `claude-sonnet-5-5`) |
| reason | `answer: the plan name "Pro" typed in (plan names come from live values)` |
| the sentence | "**Pro** nejlepší zážitek doporučujeme tablet, ale funguje i na telefonu." = "**For** the best experience we recommend a tablet, but it works on a phone too." |

**Cause: the check matched an ordinary word.** Czech "pro" means "for", and capitalised at the start of a sentence it is spelt exactly like the plan name "Pro".

**The change** (`lib/faq/translation.ts` `fieldProblem`). A translation fails on a plan name, a digit or a currency symbol **only if the English did not have it outside its `{tokens}`**, compared like with like:
- **digits:** unchanged; already only the English's own figures, in ASCII;
- **currency symbols:** the same symbol must be in the English (it was "any symbol fails");
- **plan names:** the same name, the same case, as a whole word. A name inside a `{token}` doesn't count as the English having it.
- **A language's own ordinary words that happen to be spelt like a plan name** never count: `ORDINARY_WORDS`, by language subtag; today only `cs: ['Pro']`.
- ⚠️ **The known cost:** a Czech translation that typed the plan name "Pro" itself would pass this one check. Every other plan name ("Unlimited", "Pay as you go", the localised "Neomezený") still fails in Czech, and "Pro" still fails in every other language.
- The hourly runner passes each language's ordinary words (`scripts/faq-translate/main.ts`).
- **Unchanged:** the token check, the banned-wording check (paying at the truck) and the length check (the same lines, asserted).

**Marked for retry: nothing to write.**
- A row counts as done only when it is `ok` with the current source hash (`isFresh`). A `failed` row is asked again on **every** hourly run (`jobFor`), which is why this one was last retried at 16:27 today.
- ⚠️ **It keeps failing until you push:** the hourly workflow (`.github/workflows/faq-translate.yml`, :25) runs the code on GitHub's `main`, which still has the old check.
  - Each hourly retry costs one small model call (one question into one language) and is refused the same way.
  - After the push, the next run's retry passes, and the question shows on the Czech FAQ page.

## 4 · Waiting for your decision

```
Q1. The 4 Nov 09:02 UTC import ticked asap, options, staff and walkup back on (you had unticked them in Admin on 2 Nov).
    Their show-on-website settings were kept. From now on the importer never undoes your choices, but these four are still ticked.
    Shall I untick them again with a migration (only `checked` → false on those four keys; they stay marked as yours)?
    A) Yes — untick the four (recommended: it is what you set on 2 Nov)
    B) No — leave them ticked (you can untick them in Admin › Pricing check › Feature list yourself at any time)
```

## 5 · Proof

**`scripts/import-and-cs-fix.cjs`** (registered): **33 passed, 0 failed**. No network, no database.

**§1, from the 2 Nov state** (45 untiered rows; Admin's five edits with `updated_by`) and the real `features.json`:
- every tier applied, and notify added;
- 🔴 **Admin-unticked walkup stays unticked**, and so do asap, options and staff, with Admin's show-on-website kept;
- the four OFF features unticked;
- every file-set feature follows the file (payattruck all → hidden) and is marked 'file';
- a rerun writes nothing.

**§1, with the marks:**
- Admin's walkup untick and its "hidden" survive a re-tiering;
- an OFF tier unticks even a feature Admin ticked;
- a file-set value is re-applied;
- tick and scope are judged separately;
- Admin's untick marks `checked_by`, and Admin's scope change marks `scope_by`;
- the migration only adds and fills the marks; the importer's store reads them.

**§2, the FAQ check:**
- the real refused cs-CZ answer now passes, and failed before the change with exactly the stored reason;
- typed "Unlimited", "£29", "£" and the localised "Neomezený" still fail;
- German "Pro" still fails;
- case and whole words: "pro" and "Produkt" are not "Pro";
- a name or symbol the English itself has is allowed; one only inside a token is not;
- the token, banned-wording and length checks are unchanged;
- the hourly runner passes the ordinary words;
- a failed row is asked again on the next run.

**Related harnesses re-run, all passing:**
- competitor-features-2 79/79, competitor-check-1 227/227, pricing-check-1 82/82;
- faq-translate-fix 42/42, faq-2 142/142, faq-4 80/80;
- comparison-features-1-screens 4/4. It rewrites two of its own screenshots when run, so I restored those to HEAD.

`tsc` and `eslint` are clean on the changed files.

**Full sweep** (`node scripts/run-harnesses.cjs`, 190 harnesses including the new one): **186 passed, 4 failed. None is caused by this change.**
- **The failure that also fails at HEAD:** **`faq-1`**, "only 20261058 … 20261064 follow it". Its pinned migration list predates brand-kit-1's 20261065, and has since gained 20261066 (paperwork-1), 20261067 (this) and 20261068/69 (another session's). It is a one-line re-pin, which I can do on request.
- ⚠️ **Three failures caused by ANOTHER SESSION working in this repo at the same time** ("costs-accounts-1"):
  - It committed `8b32036f` (migrations 20261068/69) on `main` during this work.
  - It left **uncommitted** edits in `app/api/manage/route.ts`, `app/manage/[token]/page.tsx`, `messages/en-*.json` and a new `lib/accounts/`.
  - Its en-GB file gained **55 new keys** (in `errorsManage`, `manageMenu` and `manageReports`) that no language base has yet. Every translation therefore shows "Structural: 55 (missing 55)".
  - **The three failures:** **`faq-2`** (sv, da, nb, pl, … "structural 0"), **`faq-4`** (the same, for its three keys) and **`contact-1`** (cs, hu, sk, ro, … "structural 0").
  - Earlier, before those edits, the same three passed: faq-2 142/142, faq-4 80/80, contact-1 191/191.
  - I did not touch that session's files. This commit contains only this workstream's seven files.

## 6 · Files

- `supabase/migrations/20261067_import_and_cs_fix.sql`
- `lib/data-import/features.ts`: `retierCols`, `setByAdmin`; new rows marked 'file'
- `lib/data-import/store-supabase.ts`: reads `checked_by`, `scope_by`, `updated_by`
- `lib/admin/feature-actions.ts`: Admin's edits and additions mark themselves
- `lib/faq/translation.ts`: `ORDINARY_WORDS`, `ordinaryWordsOf`, and the like-with-like plan-name and symbol checks
- `scripts/faq-translate/main.ts`
- `scripts/import-and-cs-fix.cjs`; `scripts/harnesses.json`

## 7 · Undo (only if Dominic asks)

⛔ DO NOT RUN — for a migration file, only if Dominic asks, and only after the code is reverted:

```sql
begin;
alter table public.comparison_features drop constraint if exists comparison_features_checked_by_chk;
alter table public.comparison_features drop constraint if exists comparison_features_scope_by_chk;
alter table public.comparison_features drop column if exists checked_by;
alter table public.comparison_features drop column if exists scope_by;
commit;
```
