# plans-everywhere-4 — FAQ translations can be written again; translator fixed in code (not deployed); the checks wait on more runs

19 November 2026, 14:20–14:48 UTC.

- **Run on the live database:** one schema migration (Q1).
- **Triggered once:** the FAQ translator (one GitHub Actions run).
- **Committed locally:** the translator code fix (Q2), `645e145a`, **not pushed or deployed**. Per your standing rule, you deploy.
- **Untouched:** `20261119_plans_everywhere_1.sql` (not run), `content/legal`, the two named trucks.

## Summary

- **Q1 done.** `faq_translations_locale_check` now accepts a three-letter language code. The translator run I triggered **succeeded**: the first successful write since 18 Nov 14:40 UTC.
  - **11 questions translated:** 204 rows ok, 11 "failed" fil-PH rows, $2.05.
  - **Stopped at the $2 spend cap with 19 jobs left.** Those include the **four new pay-at-truck questions** and the **five section titles**.
- **So the checks can't be finished yet:**
  - /tz/faq is still a 404: Swahili has 11 answers but no section titles, and a section shows only with a translated title.
  - The four new answers have **0 translations** in any language, so no fr-FR / es-MX spot-check yet.
  - /br …0002 is still hidden (its translation hasn't been refreshed yet).
- **Q2 done** (committed, for you to deploy), with three changes:
  - three-letter codes accepted;
  - rows replaced in **one upsert**, never delete-then-insert;
  - **only locales an enabled country uses** are translated, read from country_settings at run time.
- **The money question:** yes. Since 18 Nov **4 failed runs** each made **one model call** (one question into every language) and then failed on the write, with nothing saved. At this translator's observed cost per call (~$0.08–0.30), that is roughly **$0.35–1** in total.
  - Today's successful run also wasted **3 calls (~$0.5)**: the deployed code rejected the model's fil-PH replies as malformed (§3).

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** one practical tension. "Re-trigger the translator **once**" and "finish the checks" can't both be met: one run hits the $2 cap before reaching the new questions. I triggered it once, as asked, and am asking before spending more (§5).

## 1 · Q1 — the database rule

**Migration** `supabase/migrations/20261119_faq_translations_locale_3letter.sql`:
- Committed locally as `78095cc6` (not pushed); the runner requires a committed file.
- Run with `scripts/db-migrate.cjs`: one transaction, no error.

```sql
-- UNDO (only if Dominic asks; fails while any fil-PH row exists):
--   alter table public.faq_translations drop constraint faq_translations_locale_check;
--   alter table public.faq_translations add constraint faq_translations_locale_check check (locale ~ '^[a-z]{2}-[A-Z]{2}$');
set lock_timeout = '3s';
begin;
alter table public.faq_translations drop constraint if exists faq_translations_locale_check;
alter table public.faq_translations add constraint faq_translations_locale_check check (locale ~ '^[a-z]{2,3}-[A-Z]{2}$');
commit;
```

**Read back:**

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'faq_translations_locale_check';
-- CHECK ((locale ~ '^[a-z]{2,3}-[A-Z]{2}$'::text))
```

## 2 · The translator run (triggered once)

- **What it was:** `gh workflow run faq-translate.yml --ref main`, run **44543717010**, **success** (14:26–14:46 UTC). It runs the **deployed** code, which doesn't include Q2.
- **The plan it logged:** "33 to translate (5 section titles, 28 questions) into up to 56 languages and 52 variants · cap $2.00".
- **Translated, 11 questions:**
  - …0005, …0004, …0011, …0008, …0009, …0013, …0016: 14–15 locales each (the languages added since 18 Nov);
  - …0026: 19 locales; …0018, …0020, …0023: 27 each.
  - Each also wrote 1 "failed" fil-PH row: "not returned by the model".
- **The model call failed, nothing saved, money spent:** …0012, …0025 and …0019. "save_translations was malformed twice: translations[0].locale must be a locale such as "de-DE"". The model replied with fil-PH, and the deployed validation still accepts only two letters. Q2 fixes this.
- **The end:** "Spend cap $2.00 reached: 19 left for the next run." "Done: 11 translated · 204 rows ok · 11 failed · 0 removed · $2.0546".

**The database after the run:**

```sql
select locale, count(*) filter (where status='ok') as ok, count(*) filter (where status='failed') as failed
  from faq_translations where locale in ('sw-TZ','fil-PH','fr-FR','es-MX','pt-BR') group by locale order by locale;
-- es-MX 12 ok · fil-PH 0 ok / 11 failed · fr-FR 29 ok · pt-BR 29 ok · sw-TZ 11 ok
select count(*) from faq_translations where item_id::text like 'fa000002-0000-4000-8000-0000000010%';
-- 0   (the four new pay-at-truck questions: not translated yet)
```

## 3 · Q2 — the translator code (commit `645e145a`, local, for you to deploy)

| Change | Where | What it does |
|---|---|---|
| Three-letter codes | `lib/faq/translator.ts` `validateTranslations` | `^[a-z]{2,3}-[A-Z]{2}$`: a fil-PH reply is no longer "malformed" (today 3 calls were wasted on that) |
| **Save before removing** | `scripts/faq-translate/main.ts` `write` | One **upsert** on the primary key (source_id, locale), replacing each row in place. A failed write changes nothing, so a language never ends up with fewer answers. Before: delete these locales' rows, then insert; a refused insert left them deleted. |
| **Only locales enabled countries use** | `scripts/faq-translate/main.ts` reads `country_settings` (locale, enabled) at run time; `lib/faq/translation.ts` `translatableLocales` + `jobFor(…, only)`; `lib/faq/translator.ts` passes it and logs the count | Bases and variants are translated only if a switched-on country uses them, plus the parent base a used model variant is decided against (needed for its text; every such parent is in use today anyway). Unused installed locales are skipped: fil-PH, hi-IN, ur-PK, ta-LK, en-PH, en-BB, fr-CI and vi-VN today. Existing rows in them are left alone; a locale picks up automatically when a country switches to it. Without the list (the dry-run fixtures) every locale is translated, as before. |

**Checks:**
- tsc is clean. ESLint on the three files: 0/0, the same as HEAD.
- faq-1 208/0 (re-pinned to name this round's migration precisely), faq-2 170/0, faq-3 195/0, faq-4 108/0.
- faq-translate-fix 42/0, import-and-cs-fix 33/0, perf-1 50/0, seo-geo-2 89/0.
- **A scratch proof of the new rules** (not committed), 19 of 20:
  - the eight unused locales are skipped; sw-TZ, si-LK, fr-FR, es-MX, pt-BR and ca-AD are included;
  - vi-VN is picked up once a country uses it;
  - fil-PH is accepted and a malformed locale still refused;
  - without the list, the job is unchanged.
  - The one "failure" was my own expectation: en-US and en-AU are model variants and are rightly included, as before.
- **The upsert itself can't be exercised without writing to the live database,** so it is proven only by review. It is a single `INSERT … ON CONFLICT (source_id, locale) DO UPDATE` (PostgREST `upsert` with `onConflict: 'source_id,locale'`), on the table's primary key.
- **Ran by mistake:** `scripts/revalidate-pages.cjs`, while looking for translator harnesses. It is a module that only exports functions, so running it did nothing and sent no request.

## 4 · Did the failed runs spend money with nothing saved? Yes

| Run | When (UTC) | Planned | What happened |
|---|---|---|---|
| 44408810294 (hourly) | 18 Nov 22:11 | 29 to translate, 53 languages | 1 model call (44 s), then the write was refused; nothing saved |
| 44453199628 (hourly) | 19 Nov 03:43 | 29, 53 languages | 1 call (70 s), refused, nothing saved |
| 44534730078 (hourly) | 19 Nov 13:35 | 29, 56 languages | 1 call (86 s), refused, nothing saved |
| 44541894498 (mine) | 19 Nov 14:17 | 33, 56 languages | 1 call (51 s), refused, nothing saved |

- **Why one call each:** each run translates one question (one call into every language), then writes, and the first refused write ends the run. The time from "N to translate" to the error fits one call.
- **The cost:** the logs don't print a cost for a failed run. This translator's calls cost **$0.08–0.30** each (today's log; the 18 Nov run spent $2.03 on 24 questions). So 4 wasted calls ≈ **$0.35–1**. Add today's 3 malformed-reply calls (~$0.4–0.6).
- **Why only 4 runs:** the hourly schedule hasn't run hourly. GitHub ran it only 3 times between 18 Nov 14:41 and 19 Nov 14:16.

## 5 · What I need from you

**Q. How to finish the translations** (19 jobs: 4 new questions, 5 section titles, 10 others), so the checks can be done:
- **(A, recommended) Deploy `645e145a` first, then I trigger runs until nothing is left.**
  - With Q2 live, the runs skip the 8 unused locales and stop wasting calls on fil-PH, so they cost less.
  - Roughly 2 runs at up to $2 each.
  - Then: /tz/faq in Swahili with the pay-at-truck answers, the four new answers in fr-FR and es-MX against the English, and /br …0002.
- **(B) Trigger more runs now on the deployed code.** About 2–3 runs at up to $2 each, with some calls wasted on fil-PH as today.
- **(C) Wait for the hourly schedule.** It is unreliable (3 runs in 24 hours) and spends the same as B.

## 6 · Live state now (14:48 UTC)

| Page | State |
|---|---|
| /uk/faq | the four card answers (checked 14:20, unchanged since) |
| /jm/faq | the four pay-at-truck answers in English, no card answers (14:20) |
| /br/faq | …0006, …0007, …0011 in Portuguese. …0002 is hidden: its single-plan translation is stale and isn't redone yet |
| /tz/faq | **404**: Swahili has 11 answers but no section titles yet |

## 7 · Hard rules

- **Database writes:** only the Q1 migration, plus the translator's own writes from the one run you asked for.
- **Nothing started a build or deployment:** no deploy, redeploy or push.
- Pizzeria Gusto and Le Roi du Churrasco were not touched. The plans migration was not run. `content/legal` is unchanged. No .env file was opened.
- `docs/plans-everywhere-3-report.md` shows as modified locally because your commit `1d916cac` included an earlier version; docs/ is left uncommitted.
- **Read-only queries this round:**
  - the constraint definition;
  - translations per locale;
  - rows for the new questions;
  - the run logs (`gh`).

  Each was shown in the chat.
